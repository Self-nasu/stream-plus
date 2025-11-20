// src/schemas/organization.interface.ts
import { Document } from 'mongoose';

export interface OrganizationDocument extends Document {
  email: string;
  passwordHash: string;
  apiKey: string;
  videoProcessConfig: {
    '240p': boolean;
    '360p': boolean;
    '480p': boolean;
    '720p': boolean;
    '1080p': boolean;
  };
  streamConfig: {
    allowedDomains: string[];
  };
  name?: string;
  meta?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
