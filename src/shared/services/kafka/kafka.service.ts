// src/shared/services/kafka.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private producerConnected = false;
  private consumer: Consumer | null = null;
  private readonly logger = new Logger(KafkaService.name);

  constructor() {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9094').split(',');
    const clientId = process.env.KAFKA_CLIENT_ID || 'stream-plus';
    this.kafka = new Kafka({ clientId, brokers });
  }

  async onModuleInit() {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.producerConnected = true;
    this.logger.log('Kafka producer connected');
    
    // Ensure required topics exist
    await this.ensureTopic('video-processing-a', 3); // Legacy topic for backward compatibility
    
    // Create resolution-specific topics
    const resolutions = ['240p', '360p', '480p', '720p', '1080p'];
    for (const resolution of resolutions) {
      await this.ensureTopic(`video-processing-${resolution}`, 3);
    }
  }

  /**
   * Ensure a topic exists with proper configuration for single-broker setup
   * @param topic Topic name
   * @param numPartitions Number of partitions (default: 3)
   */
  async ensureTopic(topic: string, numPartitions: number = 3) {
    const admin = await this.getAdmin();
    try {
      const topics = await admin.listTopics();
      if (!topics.includes(topic)) {
        await admin.createTopics({
          topics: [
            {
              topic,
              numPartitions,
              replicationFactor: 1, // Single broker = replication factor 1
            },
          ],
        });
        this.logger.log(`Created topic: ${topic} with ${numPartitions} partitions`);
      } else {
        this.logger.log(`Topic already exists: ${topic}`);
      }
    } catch (error) {
      this.logger.error(`Error ensuring topic ${topic}:`, error);
    } finally {
      await admin.disconnect();
    }
  }

  async produce(topic: string, message: object) {
    if (!this.producer) throw new Error('Producer not connected');
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    this.logger.log(`Produced message to ${topic}`);
  }

  async createConsumer(
    groupId = process.env.KAFKA_CONSUMER_GROUP || 'media-processor-group',
  ) {
    this.consumer = this.kafka.consumer({ groupId });
    await this.consumer.connect();
    this.logger.log('Kafka consumer connected');
    return this.consumer;
  }

  /**
   * Run a consumer for a topic. Handler must return a Promise<void>.
   */
  async runConsumer(
    topic: string,
    handler: (payload: EachMessagePayload) => Promise<void>,
  ) {
    if (!this.consumer) await this.createConsumer();
    await this.consumer!.subscribe({ topic, fromBeginning: false });
    await this.consumer!.run({
      eachMessage: async (payload) => {
        try {
          await handler(payload);
        } catch (err: unknown) {
          // log error stack/message safely
          const errMsg =
            err instanceof Error ? (err.stack ?? err.message) : String(err);
          this.logger.error('Consumer handler error', errMsg);
          throw err;
        }
      },
    });
  }

  async onModuleDestroy() {
    if (this.producer) {
      try {
        await this.producer.disconnect();
      } catch (err: unknown) {
        this.logger.warn('Error while disconnecting producer', String(err));
      }
      this.producerConnected = false;
      this.producer = null;
    }
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
      } catch (err: unknown) {
        this.logger.warn('Error while disconnecting consumer', String(err));
      }
      this.consumer = null;
    }
  }

  public isConnected(): boolean {
    return !!this.producer && this.producerConnected;
  }

  async getAdmin() {
    const admin = this.kafka.admin();
    await admin.connect();
    return admin;
  }

  async createIndependentConsumer(
    groupId: string,
    options?: {
      sessionTimeout?: number;
      heartbeatInterval?: number;
    }
  ) {
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: options?.sessionTimeout || 30000,
      heartbeatInterval: options?.heartbeatInterval || 3000,
    });
    await consumer.connect();
    return consumer;
  }
}
