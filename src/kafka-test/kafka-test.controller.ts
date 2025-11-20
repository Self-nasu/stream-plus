import { Controller, Post, Body, Logger } from '@nestjs/common';
import { KafkaService } from '../shared/services/kafka/kafka.service';

@Controller('kafka-test')
export class KafkaTestController {
  private readonly logger = new Logger(KafkaTestController.name);
  constructor(private readonly kafka: KafkaService) {}

  @Post('produce')
  async produce(@Body() body: { topic: string; message: object }) {
    const { topic, message } = body;
    await this.kafka.produce(topic, message);
    return { ok: true };
  }

  @Post('start-consumer')
  async startConsumer(@Body() body: { topic: string }) {
    const { topic } = body;
    await this.kafka.runConsumer(topic, ({ message }) => {
      const value = message.value?.toString();
      this.logger.log(`Consumed on ${topic}: ${value}`);
      return Promise.resolve();
    });
    return { consumerStartedFor: topic };
  }
}
