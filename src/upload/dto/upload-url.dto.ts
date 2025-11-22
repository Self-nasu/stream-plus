import { IsUrl, IsNotEmpty } from 'class-validator';

export class UploadUrlDto {
  @IsNotEmpty()
  @IsUrl()
  videoUrl: string;
}
