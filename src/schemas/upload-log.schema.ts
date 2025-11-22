import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type UploadLogDocument = UploadLog & Document;

@Schema({ collection: 'upload_logs', timestamps: { createdAt: true, updatedAt: false } })
export class UploadLog {
  @Prop({ required: true })
  videoID: string;

  @Prop({ required: true })
  projectID: string;

  @Prop({ required: true })
  logType: string; // "upload", "processing", "error"

  @Prop()
  message: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  details: any;
}

export const UploadLogSchema = SchemaFactory.createForClass(UploadLog);
