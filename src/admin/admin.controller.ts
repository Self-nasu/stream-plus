import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ConsumerManager } from '../processor/consumer-manager.service';
import { ProcessorService } from '../processor/processor.service';
import { ApiKeyGuard } from '../auth/api-key.guard';

@ApiTags('Admin')
@ApiSecurity('api_key')
@UseGuards(ApiKeyGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly consumerManager: ConsumerManager,
    private readonly processorService: ProcessorService,
  ) {}

  @Get('stats')
  @ApiOperation({ 
    summary: 'Get system stats (consumers, queue)',
    description: 'Returns real-time statistics about active Kafka consumers, queue depth, and partition offsets. Requires API key authentication.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'System statistics retrieved successfully',
    schema: {
      example: {
        activeConsumers: 2,
        topic: 'video-processing-a',
        groupId: 'video-processing-group',
        partitions: [
          { partition: 0, offset: '100' },
          { partition: 1, offset: '95' },
          { partition: 2, offset: '102' }
        ]
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getStats() {
    return this.consumerManager.getStats();
  }

  @Post('video/:videoID/stop')
  @ApiOperation({ 
    summary: 'Stop processing for a video',
    description: 'Request cancellation of an ongoing video processing job. The job will stop at the next checkpoint.'
  })
  @ApiParam({ 
    name: 'videoID', 
    description: 'Unique identifier of the video to stop processing',
    example: 'abc123'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Cancellation requested successfully',
    schema: {
      example: {
        message: 'Cancellation requested for video abc123'
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  @ApiResponse({ status: 404, description: 'Video not found or not currently processing' })
  async stopVideo(@Param('videoID') videoID: string) {
    this.processorService.cancelProcessing(videoID);
    return { message: `Cancellation requested for video ${videoID}` };
  }
}
