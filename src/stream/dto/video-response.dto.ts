import { ApiProperty } from '@nestjs/swagger';

export class VideoResponseDto {
  @ApiProperty({ example: 'stream/encrypted_path_string', description: 'The URL to stream the video' })
  videoURL: string;

  @ApiProperty({ example: true, description: 'Processing state of the video' })
  videostate: boolean | string;

  @ApiProperty({ example: 'https://blob.url/path/to/video.mp4', description: 'Direct path to video if not processed', required: false })
  directpath?: string;
}

export class VideoIdDto {
  @ApiProperty({ example: '12345', description: 'Video ID' })
  videoID: string;

  @ApiProperty({ example: 'video.mp4', description: 'File name' })
  fileName: string;

  @ApiProperty({ example: true, description: 'Conversion status' })
  converted: boolean;
}

export class VideoListResponseDto {
  @ApiProperty({ type: [VideoIdDto], description: 'List of videos' })
  data: VideoIdDto[];
}
