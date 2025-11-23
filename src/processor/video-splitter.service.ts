import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { Video, VideoDocument } from '../schemas/video.schema';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';

@Injectable()
export class VideoSplitterService {
  private readonly logger = new Logger(VideoSplitterService.name);

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async splitVideo(job: any): Promise<void> {
    const { videoID, projectID, filePath } = job;
    this.logger.log(`[${videoID}] Starting video split process`);

    const tempDir = path.join(os.tmpdir(), projectID, videoID, 'splitter');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const localInputPath = path.join(tempDir, 'input.mp4');

    try {
      // Download source video
      this.logger.log(`[${videoID}] Downloading source: ${filePath}`);
      await this.azureBlobService.downloadToFile(filePath, localInputPath);

      // Split video into chunks
      const chunkDuration = 60; // 60 seconds
      const outputPattern = path.join(tempDir, 'chunk_%03d.mp4');

      this.logger.log(`[${videoID}] Splitting video into ${chunkDuration}s chunks`);
      await this.runFFmpegSplit(localInputPath, outputPattern, chunkDuration);

      // Upload chunks and gather metadata
      const files = await fs.promises.readdir(tempDir);
      const chunkFiles = files.filter(f => f.startsWith('chunk_') && f.endsWith('.mp4')).sort();

      const chunks: { index: number; startTime: number; endTime: number; storagePath: string }[] = [];
      
      this.logger.log(`[${videoID}] Uploading ${chunkFiles.length} chunks`);

      for (let i = 0; i < chunkFiles.length; i++) {
        const chunkFileName = chunkFiles[i];
        const chunkPath = path.join(tempDir, chunkFileName);
        const blobPath = `${projectID}/${videoID}/source/${chunkFileName}`;

        await this.azureBlobService.uploadFile(chunkPath, blobPath);

        chunks.push({
          index: i,
          startTime: i * chunkDuration,
          endTime: (i + 1) * chunkDuration, // Approximate, last chunk might be shorter
          storagePath: blobPath,
        });
      }

      // Update video document
      await this.videoModel.updateOne(
        { videoID, projectID },
        {
          totalChunks: chunks.length,
          chunks: chunks,
          // Initialize processedChunks for all resolutions
          processedChunks: job.resolutions.reduce((acc, res) => ({ ...acc, [res]: 0 }), {}),
        }
      );

      this.logger.log(`[${videoID}] Split complete. Total chunks: ${chunks.length}`);

    } catch (error) {
      this.logger.error(`[${videoID}] Split failed:`, error);
      throw error;
    } finally {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        this.logger.warn(`[${videoID}] Failed to cleanup splitter temp dir:`, e);
      }
    }
  }

  private runFFmpegSplit(input: string, outputPattern: string, segmentTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', input,
        '-c', 'copy',
        '-map', '0',
        '-segment_time', segmentTime.toString(),
        '-f', 'segment',
        '-reset_timestamps', '1',
        outputPattern
      ];

      const ffmpeg = spawn('ffmpeg', args);

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg split failed with code ${code}`));
      });

      ffmpeg.on('error', (err) => reject(err));
    });
  }
}
