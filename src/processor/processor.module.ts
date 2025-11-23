import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProcessorController } from './processor.controller';
import { ProcessorService } from './processor.service';
import { ResolutionConsumerManager } from './resolution-consumer-manager.service';
import { SharedModule } from '../shared/shared.module';
import { Video, VideoSchema } from '../schemas/video.schema';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: Video.name, schema: VideoSchema },
    ]),
  ],
  controllers: [ProcessorController],
  providers: [ProcessorService, ResolutionConsumerManager],
  exports: [ProcessorService, ResolutionConsumerManager],
})
export class ProcessorModule {}
