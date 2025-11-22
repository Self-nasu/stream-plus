import { ApiProperty } from '@nestjs/swagger';

export class OrgResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011', description: 'Organization ID' })
  id: string;

  @ApiProperty({ example: 'organization@example.com', description: 'Organization email' })
  email: string;

  @ApiProperty({ example: 'sk_live_abc123xyz789', description: 'Generated API key for authentication' })
  apiKey: string;

  @ApiProperty({ example: 'Acme Corporation', description: 'Organization name' })
  name: string;

  @ApiProperty({
    description: 'Stream configuration settings',
    example: {
      allowedDomains: ['example.com', 'app.example.com']
    }
  })
  streamConfig: {
    allowedDomains: string[];
  };

  @ApiProperty({
    description: 'Video processing configuration (enabled resolutions)',
    example: {
      '240p': true,
      '360p': true,
      '480p': true,
      '720p': true,
      '1080p': false
    }
  })
  videoProcessConfig: {
    '240p': boolean;
    '360p': boolean;
    '480p': boolean;
    '720p': boolean;
    '1080p': boolean;
  };

  @ApiProperty({ example: '2025-11-22T10:00:00.000Z', description: 'Creation timestamp' })
  createdAt?: Date;

  @ApiProperty({ example: '2025-11-22T10:00:00.000Z', description: 'Last update timestamp' })
  updatedAt?: Date;
}
