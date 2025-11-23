import { Controller, Post, Body, Param, UploadedFile, UseInterceptors, BadRequestException, UseGuards, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadVideoDto } from './dto/upload-video.dto';
import { ApiConsumes, ApiBody, ApiOperation, ApiTags, ApiSecurity, ApiResponse } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RateLimiterGuard } from './guards/rate-limiter.guard';

@ApiTags('Upload')
@ApiSecurity('api_key')
@UseGuards(ApiKeyGuard)
@Controller()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('upload')
  @UseGuards(RateLimiterGuard)
  @ApiOperation({ 
    summary: 'Upload video file or provide URL',
    description: 'Upload a video file directly or provide a URL to download. The video will be queued for processing based on organization settings. Rate limited to 2 requests per minute per organization. Requires API key authentication.'
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description: 'Video file or URL',
    type: UploadVideoDto,
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Video uploaded successfully and queued for processing',
    schema: {
      example: {
        videoID: 'abc123',
        message: 'Video uploaded successfully',
        status: 'queued'
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Either file or videoUrl must be provided' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ 
    status: 429, 
    description: 'Rate limit exceeded - Maximum 2 upload requests per minute',
    schema: {
      example: {
        statusCode: 429,
        message: 'Rate limit exceeded. Maximum 2 upload requests per minute allowed.',
        retryAfter: 45
      }
    }
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @Req() req: any,
    @Body() dto: UploadVideoDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file && !dto.videoUrl) {
      throw new BadRequestException('Either file or videoUrl must be provided');
    }
    const organization = req.organization;
    return this.uploadService.handleUpload(organization._id.toString(), dto, organization.videoProcessConfig, file);
  }

  @Post('reprocess/:videoID')
  @ApiOperation({ 
    summary: 'Reprocess an existing video',
    description: 'Requeue an existing video for processing. Useful for retrying failed processing or applying new settings.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Video requeued for processing',
    schema: {
      example: {
        videoID: 'abc123',
        message: 'Video requeued for processing',
        status: 'queued'
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async reprocessVideo(
    @Req() req: any,
    @Param('videoID') videoID: string,
  ) {
    const organization = req.organization;
    return this.uploadService.reprocess(organization._id.toString(), videoID);
  }
}
