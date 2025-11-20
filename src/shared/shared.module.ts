// src/shared/shared.module.ts
import { Module, Global } from '@nestjs/common';
import { KafkaService } from './services/kafka/kafka.service';
import { AzureBlobService } from './services/azure-blob/azure-blob.service';

@Global()
@Module({
  providers: [KafkaService, AzureBlobService],
  exports: [KafkaService],
})
export class SharedModule {}
