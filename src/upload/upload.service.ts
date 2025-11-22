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
import { UploadVideoDto } from './dto/upload-video.dto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    @InjectModel(UploadLog.name) private uploadLogModel: Model<UploadLogDocument>,
    private readonly azureBlobService: AzureBlobService,
    private readonly kafkaService: KafkaService,
  ) {}

  async handleUpload(projectID: string, dto: UploadVideoDto, videoProcessConfig: any, file?: Express.Multer.File) {
    const videoID = uuidv4();
    const tempDir = path.join(os.tmpdir(), `upload-${videoID}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    let filePath = '';
    let fileName = '';
    let fileSize = 0;

    try {
      if (file) {
        // Handle File Upload
        fileName = file.originalname;
        fileSize = file.size;
        filePath = path.join(tempDir, fileName);
        await fs.promises.writeFile(filePath, file.buffer);
      } else if (dto.videoUrl) {
        // Handle URL Upload
        fileName = `downloaded-${videoID}.mp4`; // Default name, can be improved
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
      } else {
        throw new BadRequestException('Either file or videoUrl must be provided');
      }

      // Upload to Azure Blob Storage
      const blobPath = `${projectID}/${videoID}/${fileName}`;
      await this.azureBlobService.uploadFile(filePath, blobPath);

      // Determine resolutions from config
      const resolutions = Object.keys(videoProcessConfig).filter(
        (key) => videoProcessConfig[key] === true,
      );

      // Save Metadata to MongoDB
      const video = new this.videoModel({
        videoID,
        projectID,
        fileName,
        filePath: blobPath,
        fileSize,
        uploadTime: new Date(),
        converted: false,
        resolutions,
        processingStatus: {},
      });
      await video.save();

      // Log Upload Event
      await this.logEvent(videoID, projectID, 'upload', 'Video uploaded successfully');

      // Send Message to Kafka
      await this.kafkaService.produce('video-processing-a', {
        videoID,
        projectID,
        filePath: blobPath,
        resolutions,
        from: 'upload-service',
      });

      return {
        message: 'Upload successful, processing started',
        videoID,
        projectID,
      };

    } catch (error) {
      this.logger.error(`Upload failed for videoID: ${videoID}`, error);
      await this.logEvent(videoID, projectID, 'error', 'Upload failed', { error: error.message });
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

    await this.kafkaService.produce('video-processing-a', {
      videoID,
      projectID,
      filePath: video.filePath,
      resolutions: ['1080p', '720p', '480p', '360p'],
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
