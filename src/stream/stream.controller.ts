import { Controller, Get, Param, Res, Req, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { StreamService } from './stream.service';
import type { Response } from 'express';
import { VideoResponseDto, VideoListResponseDto } from './dto/video-response.dto';

@ApiTags('Stream')
@Controller()
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get(':project_id/GetVideoIDs')
  @ApiOperation({ summary: 'Get all video IDs for a project' })
  @ApiResponse({ status: 200, type: VideoListResponseDto })
  async getVideoIDs(@Param('project_id') projectID: string) {
    return this.streamService.getVideoIDs(projectID);
  }

  @Get('videos/:videoID')
  @ApiOperation({ summary: 'Get video stream URL or status' })
  @ApiResponse({ status: 200, type: VideoResponseDto })
  async getVideo(
    @Param('videoID') videoID: string,
    @Req() req: any,
  ) {
    return this.streamService.getVideo(videoID, req.ip, req.headers['user-agent']);
  }

  @Get('videos/:videoID/:quality')
  @ApiOperation({ summary: 'Get specific quality video stream URL' })
  @ApiResponse({ status: 200, type: VideoResponseDto })
  async getVideoQuality(
    @Param('videoID') videoID: string,
    @Param('quality') quality: string,
    @Req() req: any,
  ) {
    return this.streamService.getVideoQuality(videoID, quality, req.ip, req.headers['user-agent']);
  }

  @Get('stream/:encryptedPath')
  @ApiOperation({ summary: 'Stream video content (m3u8 or ts)' })
  @ApiParam({ name: 'encryptedPath', description: 'Encrypted path to the video file' })
  async streamVideo(
    @Param('encryptedPath') encryptedPath: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const result = await this.streamService.streamFile(encryptedPath, req.ip, req.headers['user-agent'], true);
    return this.sendStreamResponse(res, result);
  }

  @Get('stream/open/*')
  @ApiOperation({ summary: 'Stream unencrypted video content' })
  async streamOpenVideo(
    @Param('0') openPath: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // Extract the path from the URL, removing '/stream/open/'
    // const openPath = req.params[0]; 
    const result = await this.streamService.streamFile(openPath, req.ip, req.headers['user-agent'], false);
    return this.sendStreamResponse(res, result);
  }

  private sendStreamResponse(res: Response, result: any) {
    res.setHeader('Content-Type', result.contentType);
    
    if ('content' in result) {
        return res.send(result.content);
    } else if ('stream' in result) {
        return result.stream.pipe(res);
    }
  }
}
