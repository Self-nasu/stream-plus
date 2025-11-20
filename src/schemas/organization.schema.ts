// src/schemas/organization.schema.ts
import { Schema } from 'mongoose';

export const OrganizationSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },

    apiKey: { type: String, required: true, unique: true },

    videoProcessConfig: {
      type: Object,
      default: {
        '240p': true,
        '360p': true,
        '480p': true,
        '720p': true,
        '1080p': false,
      },
    },

    streamConfig: {
      allowedDomains: { type: [String], default: ['*'] },
    },

    name: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: 'organizations',
  },
);
