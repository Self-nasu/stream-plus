import { Module } from '@nestjs/common';
import { KafkaTestController } from './kafka-test.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [KafkaTestController],
})
export class KafkaTestModule {}
