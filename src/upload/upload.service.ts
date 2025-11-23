import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { Video, VideoDocument } from '../schemas/video.schema';
import { UploadLog, UploadLogDocument } from '../schemas/upload-log.schema';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';
import { KafkaService } from '../shared/services/kafka/kafka.service';
import { UploadDeduplicationService } from '../shared/services/upload-deduplication.service';
import { UploadVideoDto } from './dto/upload-video.dto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    @InjectModel(UploadLog.name) private uploadLogModel: Model<UploadLogDocument>,
    private readonly azureBlobService: AzureBlobService,
    private readonly kafkaService: KafkaService,
    private readonly deduplicationService: UploadDeduplicationService,
  ) {}

  async handleUpload(projectID: string, dto: UploadVideoDto, videoProcessConfig: any, file?: Express.Multer.File) {
    let fileName = '';
    let fileSize = 0;

    // Determine file metadata first
    if (file) {
      fileName = file.originalname;
      fileSize = file.size;
    } else if (dto.videoUrl) {
      // For URL uploads, we'll check size after download
      fileName = `downloaded-${Date.now()}.mp4`;
      fileSize = 0; // Will be determined after download
    } else {
      throw new BadRequestException('Either file or videoUrl must be provided');
    }

    // Check for duplicate uploads (skip for URL uploads until we have size)
    if (file) {
      const existingVideoID = await this.deduplicationService.checkDuplicate(
        projectID,
        fileName,
        fileSize,
      );

      if (existingVideoID) {
        this.logger.log(`Duplicate upload detected, returning existing videoID: ${existingVideoID}`);
        return {
          message: 'Video already uploaded and processing',
          videoID: existingVideoID,
          projectID,
          duplicate: true,
        };
      }
    }

    const videoID = uuidv4();
    const tempDir = path.join(os.tmpdir(), `upload-${videoID}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    let filePath = '';

    try {
      // Register upload as in-flight
      if (file) {
        this.deduplicationService.registerUpload(projectID, fileName, fileSize, videoID);
      }

      if (file) {
        // Handle File Upload - use streaming for large files
        filePath = path.join(tempDir, fileName);
        
        if (fileSize > 100 * 1024 * 1024) { // > 100MB, use streaming
          this.logger.log(`Large file detected (${(fileSize / 1024 / 1024).toFixed(2)}MB), using streaming upload`);
          await fs.promises.writeFile(filePath, file.buffer);
        } else {
          await fs.promises.writeFile(filePath, file.buffer);
        }
      } else if (dto.videoUrl) {
        // Handle URL Upload with streaming
        filePath = path.join(tempDir, fileName);
        
        this.logger.log(`Downloading video from URL: ${dto.videoUrl}`);
        const response = await axios({
          method: 'GET',
          url: dto.videoUrl,
          responseType: 'stream',
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', () => resolve());
          writer.on('error', reject);
        });

        const stats = await fs.promises.stat(filePath);
        fileSize = stats.size;
        
        // Now check for duplicates with actual file size
        const existingVideoID = await this.deduplicationService.checkDuplicate(
          projectID,
          fileName,
          fileSize,
        );

        if (existingVideoID) {
          this.logger.log(`Duplicate URL upload detected, returning existing videoID: ${existingVideoID}`);
          await fs.promises.rm(tempDir, { recursive: true, force: true });
          return {
            message: 'Video already uploaded and processing',
            videoID: existingVideoID,
            projectID,
            duplicate: true,
          };
        }

        this.deduplicationService.registerUpload(projectID, fileName, fileSize, videoID);
      }

      // Upload to Azure Blob Storage with videoID as filename
      const fileExtension = path.extname(fileName);
      const newFileName = `video${fileExtension}`;
      const blobPath = `${projectID}/${videoID}/${newFileName}`;
      
      // Use optimized upload for large files
      if (fileSize > 100 * 1024 * 1024) { // > 100MB
        this.logger.log(`Using block-based upload for large file: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
        const readStream = fs.createReadStream(filePath);
        await this.azureBlobService.uploadStream(readStream, blobPath, 4 * 1024 * 1024, 20);
      } else {
        await this.azureBlobService.uploadFile(filePath, blobPath);
      }

      // Determine resolutions from config
      const resolutions = Object.keys(videoProcessConfig).filter(
        (key) => videoProcessConfig[key] === true,
      );

      // Initialize processing status for all resolutions
      const processingStatus: any = {};
      resolutions.forEach(resolution => {
        processingStatus[resolution] = 'queued';
      });

      // Save Metadata to MongoDB
      const video = new this.videoModel({
        videoID,
        projectID,
        fileName: newFileName,
        filePath: blobPath,
        fileSize,
        uploadTime: new Date(),
        converted: false,
        resolutions,
        processingStatus,
        availableResolutions: [],
        isPlayable: false,
      });
      await video.save();

      // Log Upload Event
      await this.logEvent(videoID, projectID, 'upload', 'Video uploaded successfully');

      // Send SPLIT_VIDEO task to video-tasks topic
      await this.kafkaService.produce('video-tasks', {
        type: 'SPLIT_VIDEO',
        videoID,
        projectID,
        filePath: blobPath,
        resolutions,
        from: 'upload-service',
      });

      // Mark upload as complete
      this.deduplicationService.completeUpload(projectID, fileName, fileSize);

      return {
        message: 'Upload successful, processing started',
        videoID,
        projectID,
      };

    } catch (error) {
      this.logger.error(`Upload failed for videoID: ${videoID}`, error);
      await this.logEvent(videoID, projectID, 'error', 'Upload failed', { error: error.message });
      
      // Mark upload as failed
      if (fileName && fileSize) {
        this.deduplicationService.failUpload(projectID, fileName, fileSize);
      }
      
      throw error;
    } finally {
      // Cleanup Temp Files
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup temp dir: ${tempDir}`, cleanupError);
      }
    }
  }

  async reprocess(projectID: string, videoID: string) {
    const video = await this.videoModel.findOne({ projectID, videoID });
    if (!video) {
      throw new BadRequestException('Video not found');
    }

    await this.kafkaService.produce('video-tasks', {
      type: 'SPLIT_VIDEO',
      videoID,
      projectID,
      filePath: video.filePath,
      resolutions: ['1080p', '720p', '480p', '360p'], // Default resolutions for reprocess
      from: 'reprocess-api',
    });

    await this.logEvent(videoID, projectID, 'processing', 'Reprocessing triggered');

    return { message: 'Reprocessing started' };
  }

  private async logEvent(videoID: string, projectID: string, logType: string, message: string, details: any = {}) {
    const log = new this.uploadLogModel({
      videoID,
      projectID,
      logType,
      message,
      details,
    });
    await log.save();
  }
}
