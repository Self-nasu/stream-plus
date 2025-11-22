import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type VideoDocument = Video & Document;

@Schema({ timestamps: true })
export class Video {
  @Prop({ required: true, unique: true })
  videoID: string;

  @Prop({ required: true })
  projectID: string;

  @Prop()
  fileName: string;

  @Prop()
  filePath: string;

  @Prop()
  masterFilePath: string;

  @Prop()
  fileSize: number;

  @Prop({ default: false })
  converted: boolean;

  @Prop()
  uploadTime: Date;

  @Prop([String])
  resolutions: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  processingStatus: any;
}

export const VideoSchema = SchemaFactory.createForClass(Video);
