export class OrgResponseDto {
  id: string;
  email: string;
  apiKey: string;
  name: string;
  streamConfig: {
    allowedDomains: string[];
  };
  videoProcessConfig: {
    '240p': boolean;
    '360p': boolean;
    '480p': boolean;
    '720p': boolean;
    '1080p': boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}
