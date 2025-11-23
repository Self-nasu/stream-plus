import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { SharedModule } from '../shared/shared.module';
import { Video, VideoSchema } from '../schemas/video.schema';
import { StreamLog, StreamLogSchema } from '../schemas/stream-log.schema';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: Video.name, schema: VideoSchema },
      { name: StreamLog.name, schema: StreamLogSchema },
    ]),
  ],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
