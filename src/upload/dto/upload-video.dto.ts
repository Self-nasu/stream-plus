import { IsUrl, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadVideoDto {
  @ApiProperty({ description: 'URL of the video to download and process', required: false })
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @ApiProperty({ type: 'string', format: 'binary', description: 'Video file to upload', required: false })
  @IsOptional()
  file?: any;
}
