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
  private cancellationTokens = new Map<string, boolean>();
  private activeProcesses = new Map<string, any[]>(); // videoID -> ChildProcess[]

  constructor(
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
    private readonly azureBlobService: AzureBlobService,
  ) {}

  async processChunk(job: any): Promise<void> {
    const { videoID, projectID, chunkIndex, chunkPath, resolution } = job;
    
    if (this.isCancelled(videoID)) {
      this.logger.warn(`[${videoID}] Processing cancelled, skipping chunk ${chunkIndex}`);
      return;
    }

    this.logger.log(`[${videoID}] Processing chunk ${chunkIndex} for ${resolution}`);

    const resConfig = RESOLUTIONS.find((r) => r.name === resolution);
    if (!resConfig) {
      throw new Error(`Invalid resolution: ${resolution}`);
    }

    const tempDir = path.join(os.tmpdir(), projectID, videoID, resolution, `chunk_${chunkIndex}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    const localInputPath = path.join(tempDir, 'input.mp4');
    const localOutputPath = path.join(tempDir, `segment_${chunkIndex}.ts`);

    try {
      // Download chunk
      await this.azureBlobService.downloadToFile(chunkPath, localInputPath);

      if (this.isCancelled(videoID)) return;

      // Transcode chunk to HLS segment
      await this.transcodeChunk(videoID, localInputPath, localOutputPath, resConfig);

      // Upload processed segment
      const blobDestination = `${projectID}/${videoID}/${resolution}/segments/segment_${chunkIndex}.ts`;
      await this.azureBlobService.uploadFile(localOutputPath, blobDestination);

      // Update progress
      await this.videoModel.updateOne(
        { videoID, projectID },
        { $inc: { [`processedChunks.${resolution}`]: 1 } }
      );

      this.logger.log(`[${videoID}] Chunk ${chunkIndex} (${resolution}) complete`);

    } catch (error) {
      if (this.isCancelled(videoID)) {
        this.logger.warn(`[${videoID}] Chunk ${chunkIndex} cancelled`);
        return;
      }
      this.logger.error(`[${videoID}] Chunk ${chunkIndex} (${resolution}) failed:`, error);
      throw error;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  async mergeChunks(job: any): Promise<void> {
    const { videoID, projectID, resolution } = job;
    
    if (this.isCancelled(videoID)) {
      this.logger.warn(`[${videoID}] Merge cancelled`);
      return;
    }

    this.logger.log(`[${videoID}] Merging chunks for ${resolution}`);

    const video = await this.videoModel.findOne({ videoID, projectID });
    if (!video) throw new Error('Video not found');

    const tempDir = path.join(os.tmpdir(), projectID, videoID, resolution, 'merge');
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // Generate playlist
      const playlistPath = path.join(tempDir, 'output.m3u8');
      let playlistContent = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:60\n#EXT-X-PLAYLIST-TYPE:VOD\n';

      // Sort chunks by index to ensure correct order
      const sortedChunks = video.chunks.sort((a, b) => a.index - b.index);

      for (const chunk of sortedChunks) {
        playlistContent += `#EXTINF:60.000,\nsegments/segment_${chunk.index}.ts\n`;
      }

      playlistContent += '#EXT-X-ENDLIST';
      await fs.promises.writeFile(playlistPath, playlistContent);

      // Upload playlist
      const blobPath = `${projectID}/${videoID}/${resolution}/output.m3u8`;
      await this.azureBlobService.uploadFile(playlistPath, blobPath);

      // Update status
      await this.videoModel.updateOne(
        { videoID, projectID },
        { [`processingStatus.${resolution}`]: 'completed' }
      );

      this.logger.log(`[${videoID}] Merged ${resolution} successfully`);

    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  async finalizeVideo(job: any): Promise<void> {
    const { videoID, projectID } = job;
    this.logger.log(`[${videoID}] Finalizing video`);

    const video = await this.videoModel.findOne({ videoID, projectID });
    if (!video) throw new Error('Video not found');

    const completedResolutions = RESOLUTIONS.filter(r => 
      video.processingStatus?.[r.name] === 'completed'
    );

    if (completedResolutions.length === 0) {
      this.logger.warn(`[${videoID}] No completed resolutions to finalize`);
      return;
    }

    const tempDir = path.join(os.tmpdir(), projectID, videoID, 'finalize');
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      const masterPlaylistPath = path.join(tempDir, 'master.m3u8');
      let playlistContent = '#EXTM3U\n';
      
      completedResolutions.forEach((res) => {
        const bandwidth = parseInt(res.bitrate) * 1000;
        playlistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${res.width}x${res.height}\n`;
        playlistContent += `${res.name}/output.m3u8\n`;
      });

      await fs.promises.writeFile(masterPlaylistPath, playlistContent);

      const masterBlobPath = `${projectID}/${videoID}/master.m3u8`;
      await this.azureBlobService.uploadFile(masterPlaylistPath, masterBlobPath);

      await this.videoModel.updateOne(
        { videoID, projectID },
        {
          masterFilePath: masterBlobPath,
          availableResolutions: completedResolutions.map(r => r.name),
          isPlayable: true,
          converted: true,
          $inc: { masterPlaylistVersion: 1 },
        }
      );

      this.logger.log(`[${videoID}] Video finalized successfully`);
      
      // Cleanup cancellation token
      this.cancellationTokens.delete(videoID);

    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  }

  private transcodeChunk(videoID: string, input: string, output: string, resolution: Resolution): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', input,
        '-threads', `${process.env.FFMPEG_THREADS || '1'}`,
        '-preset', `${process.env.FFMPEG_PRESET || 'slow'}`,
        '-vf', `scale=${resolution.width}:${resolution.height}`,
        '-c:v', 'h264',
        '-b:v', resolution.bitrate,
        '-c:a', 'aac',
        '-f', 'mpegts',
        output
      ];

      const ffmpeg = spawn('ffmpeg', args);

      // Track process
      if (!this.activeProcesses.has(videoID)) {
        this.activeProcesses.set(videoID, []);
      }
      const processes = this.activeProcesses.get(videoID);
      if (processes) {
        processes.push(ffmpeg);
      }

      ffmpeg.on('close', (code) => {
        // Remove from tracking
        const processes = this.activeProcesses.get(videoID);
        if (processes) {
          const index = processes.indexOf(ffmpeg);
          if (index > -1) processes.splice(index, 1);
          if (processes.length === 0) this.activeProcesses.delete(videoID);
        }

        if (code === 0) resolve();
        else {
            // If killed by us, it might have code null or SIGKILL
            if (this.isCancelled(videoID)) {
                reject(new Error('Cancelled'));
            } else {
                reject(new Error(`FFmpeg transcoding failed with code ${code}`));
            }
        }
      });

      ffmpeg.on('error', (err) => reject(err));
    });
  }

  cancelProcessing(videoID: string) {
    this.logger.log(`Cancelling processing for video: ${videoID}`);
    this.cancellationTokens.set(videoID, true);
    
    // Kill active processes
    const processes = this.activeProcesses.get(videoID);
    if (processes) {
      this.logger.log(`Killing ${processes.length} active FFmpeg processes for ${videoID}`);
      processes.forEach(p => p.kill('SIGKILL'));
      this.activeProcesses.delete(videoID);
    }
  }

  isCancelled(videoID: string): boolean {
    return !!this.cancellationTokens.get(videoID);
  }
}

