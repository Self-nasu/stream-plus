import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KafkaService } from '../shared/services/kafka/kafka.service';
import { ProcessorService } from './processor.service';
import { VideoSplitterService } from './video-splitter.service';
import { Video, VideoDocument } from '../schemas/video.schema';
import { Consumer } from 'kafkajs';

@Injectable()
export class TaskConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskConsumerService.name);
  private consumer: Consumer;
  private readonly topic = 'video-tasks';
  private readonly groupId = 'video-task-consumer-group';

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly processorService: ProcessorService,
    private readonly videoSplitterService: VideoSplitterService,
    @InjectModel(Video.name) private videoModel: Model<VideoDocument>,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing TaskConsumerService...');
    await this.createConsumer();
  }

  async onModuleDestroy() {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }

  private async createConsumer() {
    this.consumer = await this.kafkaService.createIndependentConsumer(
      this.groupId,
      {
        sessionTimeout: 300000, // 5 minutes
        heartbeatInterval: 10000, // 10 seconds
      }
    );

    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ message, partition, heartbeat }) => {
        if (!message.value) return;

        const rawMessage = message.value.toString();
        try {
          const job = JSON.parse(rawMessage);
          const { type, ...data } = job;

          this.logger.log(`[${type}] Processing task for video: ${data.videoID}`);
          await heartbeat();

          // Check for cancellation
          if (this.processorService.isCancelled(data.videoID)) {
            this.logger.warn(`[${type}] Task cancelled for video: ${data.videoID}`);
            // Commit offset to skip this task
            await this.consumer.commitOffsets([
              { topic: this.topic, partition, offset: (BigInt(message.offset) + 1n).toString() }
            ]);
            return;
          }

          switch (type) {
            case 'SPLIT_VIDEO':
              await this.videoSplitterService.splitVideo(data);
              await this.queueChunkTasks(data);
              break;

            case 'PROCESS_CHUNK':
              await this.processorService.processChunk(data);
              await this.checkAndQueueMerge(data);
              break;

            case 'MERGE_RESOLUTION':
              await this.processorService.mergeChunks(data);
              await this.processorService.finalizeVideo(data);
              break;

            default:
              this.logger.warn(`Unknown task type: ${type}`);
          }

          await heartbeat();
          
          await this.consumer.commitOffsets([
            { topic: this.topic, partition, offset: (BigInt(message.offset) + 1n).toString() }
          ]);

        } catch (error) {
          this.logger.error(`Error processing task:`, error);
        }
      },
    });
  }

  async getStats() {
    const admin = await this.kafkaService.getAdmin();
    try {
      const groupOffsets = await admin.fetchOffsets({ 
        groupId: this.groupId, 
        topics: [this.topic] 
      });
      
      const topicGroupOffsets = groupOffsets.find(t => t.topic === this.topic);
      if (!topicGroupOffsets) {
        return {
          topic: this.topic,
          groupId: this.groupId,
          activeConsumers: 0,
          totalLag: '0',
          partitions: []
        };
      }

      const topicOffsets = await admin.fetchTopicOffsets(this.topic);
      
      const partitions = topicGroupOffsets.partitions.map(p => {
        const topicOffset = topicOffsets.find(t => t.partition === p.partition);
        const endOffset = topicOffset ? BigInt(topicOffset.offset) : 0n;
        const currentOffset = BigInt(p.offset);
        const lag = endOffset > currentOffset ? endOffset - currentOffset : 0n;
        
        return {
          partition: p.partition,
          currentOffset: p.offset,
          endOffset: topicOffset?.offset,
          lag: lag.toString()
        };
      });

      const totalLag = partitions.reduce((acc, p) => acc + BigInt(p.lag), 0n);

      const groupDescription = await admin.describeGroups([this.groupId]);
      const activeConsumers = groupDescription.groups[0]?.members.length || 0;

      return {
        topic: this.topic,
        groupId: this.groupId,
        activeConsumers,
        totalLag: totalLag.toString(),
        partitions
      };
    } finally {
      await admin.disconnect();
    }
  }

  private async queueChunkTasks(data: any) {
    const { videoID, projectID, resolutions } = data;
    
    const video = await this.videoModel.findOne({ videoID, projectID });
    if (!video || !video.chunks) {
      this.logger.error(`[${videoID}] Video or chunks not found after splitting`);
      return;
    }

    this.logger.log(`[${videoID}] Queuing ${video.chunks.length * resolutions.length} chunk tasks`);

    const messages: any[] = [];
    for (const resolution of resolutions) {
      for (const chunk of video.chunks) {
        messages.push({
          type: 'PROCESS_CHUNK',
          videoID,
          projectID,
          resolution,
          chunkIndex: chunk.index,
          chunkPath: chunk.storagePath,
          resolutions, // Pass along for context if needed
        });
      }
    }

    // Send in batches to avoid Kafka limits if video is huge
    const batchSize = 50;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await Promise.all(batch.map(msg => this.kafkaService.produce(this.topic, msg)));
    }
  }

  private async checkAndQueueMerge(data: any) {
    const { videoID, projectID, resolution } = data;
    
    const video = await this.videoModel.findOne({ videoID, projectID });
    if (!video) return;

    const processedCount = video.processedChunks?.[resolution] || 0;
    const totalChunks = video.totalChunks;

    if (processedCount >= totalChunks) {
      this.logger.log(`[${videoID}] All chunks processed for ${resolution}. Queuing merge.`);
      await this.kafkaService.produce(this.topic, {
        type: 'MERGE_RESOLUTION',
        videoID,
        projectID,
        resolution,
      });
    }
  }
}
