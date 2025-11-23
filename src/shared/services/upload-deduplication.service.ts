import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Video, VideoDocument } from '../../schemas/video.schema';
import * as crypto from 'crypto';

interface InFlightUpload {
  videoID: string;
  timestamp: number;
  fileName: string;
}

@Injectable()
export class UploadDeduplicationService {
  private readonly logger = new Logger(UploadDeduplicationService.name);
  private readonly inFlightUploads = new Map<string, InFlightUpload>();
  private readonly ttlMs = 30 * 60 * 1000; // 30 minutes

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
  ) {
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Generate a unique key for deduplication based on org, file size, and name
   */
  private generateUploadKey(
    projectID: string,
    fileName: string,
    fileSize: number,
  ): string {
    const data = `${projectID}:${fileName}:${fileSize}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Check if an upload is already in progress or recently completed
   * Returns existing videoID if duplicate, null otherwise
   */
  async checkDuplicate(
    projectID: string,
    fileName: string,
    fileSize: number,
  ): Promise<string | null> {
    const key = this.generateUploadKey(projectID, fileName, fileSize);

    // Check in-flight uploads (in-memory)
    const inFlight = this.inFlightUploads.get(key);
    if (inFlight) {
      this.logger.warn(
        `Duplicate upload detected (in-flight): ${fileName} for project ${projectID}. ` +
        `Returning existing videoID: ${inFlight.videoID}`
      );
      return inFlight.videoID;
    }

    // Check recently uploaded videos in database (last 30 minutes)
    const recentUploadTime = new Date(Date.now() - this.ttlMs);
    const existingVideo = await this.videoModel.findOne({
      projectID,
      fileName,
      fileSize,
      uploadTime: { $gte: recentUploadTime },
    }).sort({ uploadTime: -1 });

    if (existingVideo) {
      this.logger.warn(
        `Duplicate upload detected (recent): ${fileName} for project ${projectID}. ` +
        `Returning existing videoID: ${existingVideo.videoID}`
      );
      return existingVideo.videoID;
    }

    return null;
  }

  /**
   * Register an upload as in-progress
   */
  registerUpload(
    projectID: string,
    fileName: string,
    fileSize: number,
    videoID: string,
  ): void {
    const key = this.generateUploadKey(projectID, fileName, fileSize);
    
    this.inFlightUploads.set(key, {
      videoID,
      timestamp: Date.now(),
      fileName,
    });

    this.logger.log(
      `Registered in-flight upload: ${fileName} (${videoID}) for project ${projectID}`
    );
  }

  /**
   * Mark an upload as complete (remove from in-flight)
   */
  completeUpload(
    projectID: string,
    fileName: string,
    fileSize: number,
  ): void {
    const key = this.generateUploadKey(projectID, fileName, fileSize);
    const removed = this.inFlightUploads.delete(key);
    
    if (removed) {
      this.logger.log(
        `Completed upload: ${fileName} for project ${projectID}`
      );
    }
  }

  /**
   * Remove an upload from in-flight (on error)
   */
  failUpload(
    projectID: string,
    fileName: string,
    fileSize: number,
  ): void {
    const key = this.generateUploadKey(projectID, fileName, fileSize);
    this.inFlightUploads.delete(key);
    
    this.logger.log(
      `Failed upload removed from tracking: ${fileName} for project ${projectID}`
    );
  }

  /**
   * Cleanup expired in-flight uploads
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, upload] of this.inFlightUploads.entries()) {
      if (now - upload.timestamp > this.ttlMs) {
        this.inFlightUploads.delete(key);
        cleaned++;
        this.logger.warn(
          `Cleaned up stale in-flight upload: ${upload.fileName} (${upload.videoID})`
        );
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} stale in-flight uploads`);
    }
  }

  /**
   * Get statistics for monitoring
   */
  getStats() {
    return {
      inFlightCount: this.inFlightUploads.size,
      uploads: Array.from(this.inFlightUploads.values()).map(upload => ({
        videoID: upload.videoID,
        fileName: upload.fileName,
        ageSeconds: Math.floor((Date.now() - upload.timestamp) / 1000),
      })),
    };
  }
}
