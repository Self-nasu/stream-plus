import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaService } from '../shared/services/kafka/kafka.service';
import { ProcessorService } from './processor.service';
import { Consumer } from 'kafkajs';

@Injectable()
export class ConsumerManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumerManager.name);
  private consumers: Consumer[] = [];
  private readonly topic = 'video-processing-a';
  private readonly groupId = 'video-processing-group';
  private readonly maxConsumers = 3;
  private readonly minConsumers = 1;
  private checkInterval: NodeJS.Timeout;

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly processorService: ProcessorService,
  ) {}

  async onModuleInit() {
    // Start with min consumers
    for (let i = 0; i < this.minConsumers; i++) {
      await this.addConsumer();
    }

    // Start load balancer
    this.checkInterval = setInterval(() => this.checkLoad(), 10000); // Check every 10s
  }

  async onModuleDestroy() {
    clearInterval(this.checkInterval);
    for (const consumer of this.consumers) {
      await consumer.disconnect();
    }
  }

  async getStats() {
    const admin = await this.kafkaService.getAdmin();
    const offsets = await admin.fetchOffsets({ groupId: this.groupId, topics: [this.topic] });
    await admin.disconnect();

    // Calculate total lag
    // Note: This is a simplification. Real lag calc needs topic end offsets.
    // For now, we'll return the consumer count and raw offsets.
    
    return {
      activeConsumers: this.consumers.length,
      topic: this.topic,
      groupId: this.groupId,
      partitions: offsets,
    };
  }

  private async checkLoad() {
    try {
      // In a real scenario, fetch topic end offsets and compare with consumer offsets to get lag.
      // For this demo, we'll simulate scaling based on random load or just keep it simple.
      // Let's say if we have > 10 messages lag per consumer, we scale up.
      
      // Placeholder for lag calculation
      const lag = Math.floor(Math.random() * 20); 
      this.logger.log(`Current estimated lag: ${lag}`);

      if (lag > 10 && this.consumers.length < this.maxConsumers) {
        this.logger.log('High load detected. Scaling up...');
        await this.addConsumer();
      } else if (lag < 2 && this.consumers.length > this.minConsumers) {
        this.logger.log('Low load detected. Scaling down...');
        await this.removeConsumer();
      }
    } catch (err) {
      this.logger.error('Error checking load', err);
    }
  }

  private async addConsumer() {
    const consumer = await this.kafkaService.createIndependentConsumer(this.groupId);
    await consumer.subscribe({ topic: this.topic });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const job = JSON.parse(message.value.toString());
        await this.processorService.processVideo(job);
      },
    });
    this.consumers.push(consumer);
    this.logger.log(`Consumer added. Total: ${this.consumers.length}`);
  }

  private async removeConsumer() {
    const consumer = this.consumers.pop();
    if (consumer) {
      await consumer.disconnect();
      this.logger.log(`Consumer removed. Total: ${this.consumers.length}`);
    }
  }
}
