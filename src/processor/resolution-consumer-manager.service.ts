import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaService } from '../shared/services/kafka/kafka.service';
import { ProcessorService } from './processor.service';
import { Consumer } from 'kafkajs';

interface ConsumerInfo {
  resolution: string;
  consumer: Consumer;
  isProcessing: boolean;
  processedCount: number;
  errorCount: number;
}

@Injectable()
export class ResolutionConsumerManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResolutionConsumerManager.name);
  private consumers: Map<string, ConsumerInfo> = new Map();
  private readonly resolutions = ['240p', '360p', '480p', '720p', '1080p'];
  private healthCheckInterval: NodeJS.Timeout;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly processorService: ProcessorService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing resolution-specific consumers...');
    
    // Create one consumer per resolution
    for (const resolution of this.resolutions) {
      await this.createConsumerForResolution(resolution);
    }

    // Start health check monitoring
    this.healthCheckInterval = setInterval(() => this.healthCheck(), 30000); // Every 30s
    
    this.logger.log(`Started ${this.consumers.size} resolution-specific consumers`);
  }

  async onModuleDestroy() {
    clearInterval(this.healthCheckInterval);
    
    this.logger.log('Shutting down resolution consumers...');
    for (const [resolution, info] of this.consumers.entries()) {
      try {
        await info.consumer.disconnect();
        this.logger.log(`Disconnected consumer for ${resolution}`);
      } catch (error) {
        this.logger.error(`Error disconnecting consumer for ${resolution}:`, error);
      }
    }
    this.consumers.clear();
  }

  private async createConsumerForResolution(resolution: string) {
    const topic = `video-processing-${resolution}`;
    const groupId = `video-processor-${resolution}-group`;

    try {
      const consumer = await this.kafkaService.createIndependentConsumer(groupId);
      
      // Add to map BEFORE subscribing to avoid race condition
      const consumerInfo: ConsumerInfo = {
        resolution,
        consumer,
        isProcessing: false,
        processedCount: 0,
        errorCount: 0,
      };
      this.consumers.set(resolution, consumerInfo);
      
      // Subscribe from beginning to process queued messages
      await consumer.subscribe({ topic, fromBeginning: true });

      await consumer.run({
        eachMessage: async ({ message, partition }) => {
          if (!message.value) return;

          const info = this.consumers.get(resolution);
          if (!info) return;

          info.isProcessing = true;
          const rawMessage = message.value.toString();
          
          try {
            this.logger.log(
              `[${resolution}] 📩 Received job from partition ${partition}: ${rawMessage.substring(0, 100)}...`
            );

            const job = JSON.parse(rawMessage);
            
            // Validate that this job is for the correct resolution
            if (job.resolution && job.resolution !== resolution) {
              this.logger.warn(
                `[${resolution}] Job mismatch! Expected ${resolution}, got ${job.resolution}. Skipping.`
              );
              return;
            }

            this.logger.log(`[${resolution}] 🎬 Processing video: ${job.videoID}`);
            await this.processorService.processVideo(job);
            
            info.processedCount++;
            this.logger.log(
              `[${resolution}] ✅ Completed video: ${job.videoID} (Total: ${info.processedCount})`
            );
          } catch (error) {
            info.errorCount++;
            this.logger.error(`[${resolution}] ❌ Error processing message:`, error);
            // Don't throw - let Kafka continue processing other messages
          } finally {
            info.isProcessing = false;
          }
        },
      });

      this.logger.log(`✓ Created consumer for ${resolution} (topic: ${topic}, group: ${groupId})`);
    } catch (error) {
      this.logger.error(`Failed to create consumer for ${resolution}:`, error);
      throw error;
    }
  }

  private healthCheck() {
    const stats = this.getStats();
    
    this.logger.debug('=== Consumer Health Check ===');
    for (const [resolution, info] of this.consumers.entries()) {
      this.logger.debug(
        `[${resolution}] Processing: ${info.isProcessing ? 'YES' : 'NO'}, ` +
        `Completed: ${info.processedCount}, Errors: ${info.errorCount}`
      );
    }
    
    // Check for stuck consumers (processing for too long)
    for (const [resolution, info] of this.consumers.entries()) {
      if (info.isProcessing) {
        this.logger.warn(`[${resolution}] Consumer is currently processing a job`);
      }
    }
  }

  getStats() {
    const stats = {
      totalConsumers: this.consumers.size,
      consumers: [] as any[],
      totalProcessed: 0,
      totalErrors: 0,
    };

    for (const [resolution, info] of this.consumers.entries()) {
      stats.consumers.push({
        resolution,
        isProcessing: info.isProcessing,
        processedCount: info.processedCount,
        errorCount: info.errorCount,
      });
      stats.totalProcessed += info.processedCount;
      stats.totalErrors += info.errorCount;
    }

    return stats;
  }

  // Get status of a specific resolution consumer
  getConsumerStatus(resolution: string) {
    return this.consumers.get(resolution);
  }
}
