import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StreamLogDocument = StreamLog & Document;

@Schema({ collection: 'stream_logs', timestamps: { createdAt: 'timestamp', updatedAt: false } })
export class StreamLog {
  @Prop({ required: true })
  videoID: string;

  @Prop({ required: true })
  projectID: string;

  @Prop()
  userIP: string;

  @Prop()
  userAgent: string;
}

export const StreamLogSchema = SchemaFactory.createForClass(StreamLog);
