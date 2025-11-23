import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as path from 'path';
import { Video, VideoDocument } from '../schemas/video.schema';
import { StreamLog, StreamLogDocument } from '../schemas/stream-log.schema';
import { CryptoService } from '../shared/services/crypto/crypto.service';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';
import { Readable } from 'stream';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    @InjectModel(StreamLog.name) private streamLogModel: Model<StreamLogDocument>,
    private readonly cryptoService: CryptoService,
    private readonly azureBlobService: AzureBlobService,
    private readonly configService: ConfigService,
  ) {}

  async getVideoIDs(projectID: string) {
    const videos = await this.videoModel
      .find({ projectID })
      .select({ videoID: 1, fileName: 1, converted: 1, _id: 0 })
      .exec();

    return { data: videos };
  }

  async getVideo(videoID: string, userIP: string, userAgent: string) {
    const video = await this.videoModel.findOne(
      { videoID },
      { filePath: 1, converted: 1, projectID: 1, _id: 0 }
    ).exec();

    if (!video) {
        // Fallback to check if it exists but maybe projection missed something? 
        // No, findOne returns null if not found.
        // But wait, the old code had logic:
        // if (videostate === true) ... else ...
        // and inside else: if (videostate === false) ... else 404
        // So if video exists it's either true or false.
        throw new NotFoundException('Video not found');
    }
    
    if (video.converted) {
        const blobDir = path.dirname(video.filePath); // projectID/videoID
        const masterBlobPath = `${blobDir}/master.m3u8`;
        
        const streamEncrypt = this.configService.get<boolean>('streamEncrypt');
        let videoURL: string;

        if (streamEncrypt) {
            const encryptedPath = this.cryptoService.encryptFilePath(masterBlobPath);
            videoURL = `stream/${encodeURIComponent(encryptedPath)}`;
        } else {
            videoURL = `stream/open/${masterBlobPath}`;
        }
        
        await this.logStreamEvent(videoID, video.projectID, userIP, userAgent);
        
        return {
            videoURL,
            videostate: true
        };
    } else {
        // Not converted
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
        const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const directUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${video.filePath}`;
        
        return {
            videostate: false,
            directpath: directUrl
        };
    }
  }

  async getVideoQuality(videoID: string, quality: string, userIP: string, userAgent: string) {
    // Logic to get specific quality stream
    const video = await this.videoModel.findOne({ videoID }).exec();
    if (!video) throw new NotFoundException('Video not found');

    if (video.converted) {
        const blobDir = path.dirname(video.filePath);
        const qualityBlobPath = `${blobDir}/${quality}/output.m3u8`;
        
        const streamEncrypt = this.configService.get<boolean>('streamEncrypt');
        let videoURL: string;

        if (streamEncrypt) {
            const encryptedPath = this.cryptoService.encryptFilePath(qualityBlobPath);
            videoURL = `stream/${encodeURIComponent(encryptedPath)}`;
        } else {
            videoURL = `stream/open/${qualityBlobPath}`;
        }

        await this.logStreamEvent(videoID, video.projectID, userIP, userAgent);
        
        return { videoURL };
    } else {
        // Fallback to direct path logic from old code
         const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
        const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const directUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${video.filePath}`;
        
        return {
            videostate: 'processing',
            directpath: directUrl
        };
    }
  }

  async streamFile(pathOrEncrypted: string, userIP: string, userAgent: string, isEncrypted: boolean) {
    if (!pathOrEncrypted) {
        throw new BadRequestException('Path is required');
    }
    let blobPath: string;
    
    if (isEncrypted) {
        try {
            blobPath = this.cryptoService.decryptFilePath(decodeURIComponent(pathOrEncrypted));
        } catch (e) {
            this.logger.error(`Decryption failed for path: ${pathOrEncrypted}`, e);
            throw new BadRequestException('Invalid encrypted path');
        }
    } else {
        blobPath = pathOrEncrypted;
    }

    this.logger.log(`Streaming file: ${blobPath}`);

    const exists = await this.azureBlobService.exists(blobPath);
    if (!exists) {
        this.logger.warn(`File not found in Azure Blob Storage: ${blobPath}`);
        throw new NotFoundException('File not found');
    }

    // Log event
    const parts = blobPath.split('/');
    if (parts.length >= 2) {
        await this.logStreamEvent(parts[1], parts[0], userIP, userAgent);
    }

    if (blobPath.endsWith('.m3u8')) {
        const buffer = await this.azureBlobService.downloadToBuffer(blobPath);
        const fileContent = buffer.toString();

        const streamEncrypt = this.configService.get<boolean>('streamEncrypt');

        if (blobPath.includes('master.m3u8')) {
            // Master playlist: rewrite quality playlist paths (e.g., "240p/output.m3u8")
            const basePath = path.dirname(blobPath);
            // Match .m3u8 files that appear after a newline (actual playlist entries, not in #EXT-X-STREAM-INF)
            const updatedContent = fileContent.replace(/^([^\n#].*\.m3u8)$/gm, (match, relativePath) => {
                // relativePath is like "240p/output.m3u8"
                const fullPath = `${basePath}/${relativePath.trim()}`;
                if (streamEncrypt) {
                    const encryptedPath = this.cryptoService.encryptFilePath(fullPath);
                    return `/stream/${encodeURIComponent(encryptedPath)}`;
                } else {
                    return `/stream/open/${fullPath}`;
                }
            });
            return { content: updatedContent, contentType: 'application/vnd.apple.mpegurl' };
        }

        if (blobPath.includes('output.m3u8')) {
            // Quality playlist: rewrite segment paths (e.g., "segments/segment_0.ts")
            const basePath = path.dirname(blobPath);
            // Match .ts files that appear after a newline (actual segment entries)
            const updatedContent = fileContent.replace(/^([^\n#].*\.ts)$/gm, (match, segmentPath) => {
                // segmentPath is like "segments/segment_0.ts"
                const fullPath = `${basePath}/${segmentPath.trim()}`;
                if (streamEncrypt) {
                    const encryptedPath = this.cryptoService.encryptFilePath(fullPath);
                    return `/stream/${encodeURIComponent(encryptedPath)}`;
                } else {
                    return `/stream/open/${fullPath}`;
                }
            });
            return { content: updatedContent, contentType: 'application/vnd.apple.mpegurl' };
        }
        
        return { content: fileContent, contentType: 'application/vnd.apple.mpegurl' };
    }

    if (blobPath.endsWith('.ts')) {
        const stream = await this.azureBlobService.streamBlob(blobPath);
        return { stream, contentType: 'video/mp2t' };
    }

    throw new BadRequestException('Unsupported file type');
  }

  private async logStreamEvent(videoID: string, projectID: string, userIP: string, userAgent: string) {
    try {
        await this.streamLogModel.create({
            videoID,
            projectID,
            userIP,
            userAgent,
            timestamp: new Date()
        });
    } catch (e) {
        this.logger.error(`Failed to log stream event: ${e.message}`);
    }
  }
}
