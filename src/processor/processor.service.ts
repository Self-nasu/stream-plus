import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);
  // In a real app, use Redis. For now, in-memory map for cancellation tokens.
  private cancellationTokens = new Map<string, boolean>();

  async processVideo(job: any) {
    const { videoID } = job;
    this.logger.log(`Starting processing for video: ${videoID}`);

    if (this.isCancelled(videoID)) {
      this.logger.warn(`Processing cancelled for video: ${videoID}`);
      return;
    }

    // Simulate Step 1: Download
    await this.simulateWork(videoID, 'Downloading', 2000);
    if (this.isCancelled(videoID)) return;

    // Simulate Step 2: Transcoding (Long process)
    await this.simulateWork(videoID, 'Transcoding 1080p', 5000);
    if (this.isCancelled(videoID)) return;

    await this.simulateWork(videoID, 'Transcoding 720p', 4000);
    if (this.isCancelled(videoID)) return;

    // Simulate Step 3: Upload
    await this.simulateWork(videoID, 'Uploading', 2000);

    this.logger.log(`Processing completed for video: ${videoID}`);
    // Cleanup
    this.cancellationTokens.delete(videoID);
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

  private async simulateWork(videoID: string, step: string, ms: number) {
    this.logger.log(`[${videoID}] ${step}...`);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
