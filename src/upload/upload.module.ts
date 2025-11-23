import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { SharedModule } from '../shared/shared.module';
import { Video, VideoSchema } from '../schemas/video.schema';
import { UploadLog, UploadLogSchema } from '../schemas/upload-log.schema';
import { OrganizationModule } from '../organization/organization.module';
import { RateLimiterGuard } from './guards/rate-limiter.guard';

@Module({
  imports: [
    SharedModule,
    MongooseModule.forFeature([
      { name: Video.name, schema: VideoSchema },
      { name: UploadLog.name, schema: UploadLogSchema },
    ]),
    OrganizationModule,
  ],
  controllers: [UploadController],
  providers: [UploadService, RateLimiterGuard],
})
export class UploadModule {}
