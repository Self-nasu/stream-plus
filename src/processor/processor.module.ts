import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProcessorController } from './processor.controller';
import { ProcessorService } from './processor.service';
import { TaskConsumerService } from './task-consumer.service';
import { VideoSplitterService } from './video-splitter.service';
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
  providers: [ProcessorService, TaskConsumerService, VideoSplitterService],
  exports: [ProcessorService, TaskConsumerService, VideoSplitterService],
})
export class ProcessorModule {}
