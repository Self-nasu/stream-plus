import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ required: true, unique: true })
  apiKey: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
