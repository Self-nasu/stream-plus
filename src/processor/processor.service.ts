import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Video, VideoDocument } from '../schemas/video.schema';
import { AzureBlobService } from '../shared/services/azure-blob/azure-blob.service';

interface Resolution {
  name: string;
  width: number;
  height: number;
  bitrate: string;
}

const RESOLUTIONS: Resolution[] = [
  { name: '240p', width: 426, height: 240, bitrate: '300k' },
  { name: '360p', width: 640, height: 360, bitrate: '500k' },
  { name: '480p', width: 854, height: 480, bitrate: '700k' },
  { name: '720p', width: 1280, height: 720, bitrate: '900k' },
  { name: '1080p', width: 1920, height: 1080, bitrate: '1500k' },
];

@Injectable()
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);
  // In a real app, use Redis. For now, in-memory map for cancellation tokens.
  private cancellationTokens = new Map<string, boolean>();

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async processVideo(job: any) {
    const { videoID, projectID, filePath, resolution } = job;
    
    // Support both single resolution (new) and multiple resolutions (legacy)
    const resolutionToProcess = resolution || (job.resolutions && job.resolutions[0]);
    
    if (!resolutionToProcess) {
      this.logger.error(`[${videoID}] No resolution specified in job`);
      return;
    }

    this.logger.log(`[${videoID}] Starting ${resolutionToProcess} processing`);
    this.logger.log(`[${videoID}] Job details: ${JSON.stringify(job)}`);

    if (this.isCancelled(videoID)) {
      this.logger.warn(`[${videoID}] Processing cancelled`);
      return;
    }

    const tempDir = path.join(os.tmpdir(), projectID, videoID, 'temp');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const localInputPath = path.join(tempDir, 'input.mp4');

    try {
      // Step 1: Download video from blob
      this.logger.log(`[${videoID}] Downloading from blob: ${filePath}`);
      await this.azureBlobService.downloadToFile(filePath, localInputPath);
      this.logger.log(`[${videoID}] Download complete`);

      if (this.isCancelled(videoID)) return;

      // Find resolution config
      const resConfig = RESOLUTIONS.find((r) => r.name === resolutionToProcess);
      if (!resConfig) {
        this.logger.error(`[${videoID}] Invalid resolution: ${resolutionToProcess}`);
        await this.updateProcessingStatus(videoID, projectID, resolutionToProcess, 'failed');
        return;
      }

      // Step 2: Process the resolution
      const outputDir = path.join(tempDir, resConfig.name);
      await fs.promises.mkdir(outputDir, { recursive: true });

      try {
        this.logger.log(`[${videoID}] Converting ${resConfig.name} to HLS`);
        await this.updateProcessingStatus(videoID, projectID, resConfig.name, 'processing');

        await this.convertToHLS(videoID, localInputPath, resConfig, outputDir);

        await this.updateProcessingStatus(videoID, projectID, resConfig.name, 'completed');
        this.logger.log(`[${videoID}] ${resConfig.name} conversion complete`);
      } catch (error) {
        this.logger.error(`[${videoID}] Failed ${resConfig.name}:`, error);
        await this.updateProcessingStatus(videoID, projectID, resConfig.name, 'failed');
        throw error;
      }

      // Step 3: Get all completed resolutions from database
      const video = await this.videoModel.findOne({ videoID, projectID });
      if (!video) {
        this.logger.error(`[${videoID}] Video not found in database`);
        return;
      }

      const completedResolutions = RESOLUTIONS.filter((r) => 
        video.processingStatus[r.name] === 'completed'
      );

      this.logger.log(
        `[${videoID}] Completed resolutions: ${completedResolutions.map(r => r.name).join(', ')}`
      );

      // Step 4: Create master playlist with all completed resolutions
      if (completedResolutions.length > 0) {
        this.logger.log(`[${videoID}] Creating master playlist with ${completedResolutions.length} resolution(s)`);
        
        // Download existing resolution folders if they exist
        for (const res of completedResolutions) {
          if (res.name !== resConfig.name) {
            // This resolution was processed before, download it
            const resDir = path.join(tempDir, res.name);
            await fs.promises.mkdir(resDir, { recursive: true });
            
            try {
              const resBlobPath = `${projectID}/${videoID}/${res.name}`;
              // Download the output.m3u8 and segments
              await this.downloadResolutionFiles(resBlobPath, resDir);
            } catch (error) {
              this.logger.warn(`[${videoID}] Could not download ${res.name} files:`, error);
            }
          }
        }

        const masterPlaylistPath = this.createMasterPlaylist(tempDir, completedResolutions);

        // Step 5: Upload processed files to blob
        this.logger.log(`[${videoID}] Uploading ${resConfig.name} files to blob`);
        const blobDestination = `${projectID}/${videoID}`;
        
        // Upload only the current resolution folder and master playlist
        await this.azureBlobService.uploadFolder(
          path.join(tempDir, resConfig.name),
          `${blobDestination}/${resConfig.name}`
        );
        
        // Upload master playlist
        const masterBlobPath = `${blobDestination}/master.m3u8`;
        await this.azureBlobService.uploadFile(masterPlaylistPath, masterBlobPath);

        // Step 6: Update video document with all completed resolutions
        const availableResolutionNames = completedResolutions.map(r => r.name);
        
        const updateData: any = {
          masterFilePath: masterBlobPath,
          availableResolutions: availableResolutionNames, // Set to all completed resolutions
          $inc: { masterPlaylistVersion: 1 },
        };

        // Mark as playable and converted when first resolution is ready
        if (!video.isPlayable) {
          updateData.isPlayable = true;
          updateData.converted = true;
          this.logger.log(`[${videoID}] 🎉 Video is now playable with ${resConfig.name}!`);
        }

        await this.videoModel.updateOne(
          { videoID, projectID },
          updateData
        );

        this.logger.log(
          `[${videoID}] Processing completed successfully. ` +
          `Available resolutions: ${availableResolutionNames.join(', ')}`
        );
      }
    } catch (error) {
      this.logger.error(`[${videoID}] Processing failed:`, error);
      throw error;
    } finally {
      // Cleanup temp files
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        this.logger.log(`[${videoID}] Cleanup complete`);
      } catch (cleanupError) {
        this.logger.warn(`[${videoID}] Failed to cleanup temp dir:`, cleanupError);
      }
      this.cancellationTokens.delete(videoID);
    }
  }

  private async downloadResolutionFiles(blobPath: string, localDir: string): Promise<void> {
    // For simplicity, we'll skip re-downloading. In production, you'd download the m3u8 and segments
    // This is acceptable since we're creating a new master playlist each time
    this.logger.debug(`Skipping download of ${blobPath} (master playlist will reference blob paths)`);
  }

  private async convertToHLS(
    videoID: string,
    inputFile: string,
    resolution: Resolution,
    outputDir: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const segmentPath = path.join(outputDir, 'segment%03d.ts');
      const outputM3U8 = path.join(outputDir, 'output.m3u8');

      const ffmpegArgs = [
        '-i', inputFile,
        '-vf', `scale=${resolution.width}:${resolution.height}`,
        '-c:v', 'h264',
        '-b:v', resolution.bitrate,
        '-c:a', 'aac',
        '-hls_time', '10',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPath,
        outputM3U8,
      ];

      this.logger.log(`[${videoID}] Running FFmpeg for ${resolution.name}`);

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      // Timeout: Kill FFmpeg if it takes more than 25 minutes
      const timeout = setTimeout(() => {
        this.logger.error(`[${videoID}] FFmpeg timeout for ${resolution.name}`);
        ffmpegProcess.kill('SIGKILL');
        reject(new Error('Processing Timeout'));
      }, 25 * 60 * 1000);

      ffmpegProcess.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr, log periodically
        const output = data.toString();
        if (output.includes('time=')) {
          this.logger.debug(`[${videoID}] FFmpeg progress: ${output.trim()}`);
        }
      });

      ffmpegProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          this.logger.log(`[${videoID}] FFmpeg complete for ${resolution.name}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg process failed with exit code ${code}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private createMasterPlaylist(outputDir: string, processedResolutions: Resolution[]): string {
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    let playlistContent = '#EXTM3U\n';
    
    processedResolutions.forEach((res) => {
      const bandwidth = parseInt(res.bitrate) * 1000; // Convert to bits
      playlistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${res.width}x${res.height}\n`;
      playlistContent += `${res.name}/output.m3u8\n`;
    });

    fs.writeFileSync(masterPlaylistPath, playlistContent);
    this.logger.log(`Master playlist created at: ${masterPlaylistPath}`);
    return masterPlaylistPath;
  }

  private async updateProcessingStatus(
    videoID: string,
    projectID: string,
    resolution: string,
    status: string,
  ): Promise<void> {
    await this.videoModel.updateOne(
      { videoID, projectID },
      { [`processingStatus.${resolution}`]: status },
    );
    this.logger.log(`[${videoID}] Status updated: ${resolution} -> ${status}`);
  }

  cancelProcessing(videoID: string) {
    this.logger.log(`Requesting cancellation for video: ${videoID}`);
    this.cancellationTokens.set(videoID, true);
  }

  private isCancelled(videoID: string): boolean {
    if (this.cancellationTokens.get(videoID)) {
      this.logger.warn(`Job aborted: ${videoID}`);
      return true;
    }
    return false;
  }
}
