// src/shared/shared.module.ts
import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KafkaService } from './services/kafka/kafka.service';
import { AzureBlobService } from './services/azure-blob/azure-blob.service';
import { UploadDeduplicationService } from './services/upload-deduplication.service';
import { Video, VideoSchema } from '../schemas/video.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Video.name, schema: VideoSchema },
    ]),
  ],
  providers: [KafkaService, AzureBlobService, UploadDeduplicationService],
  exports: [KafkaService, AzureBlobService, UploadDeduplicationService],
})
export class SharedModule {}
