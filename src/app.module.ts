// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { MongooseModule } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { HealthModule } from './health/health.module';
import { SharedModule } from './shared/shared.module';
import { KafkaTestModule } from './kafka-test/kafka-test.module';
import { StatusModule } from './status/status.module';
import { OrganizationModule } from './organization/organization.module';
import { UploadModule } from './upload/upload.module';
import { ProcessorModule } from './processor/processor.module';
import { AdminModule } from './admin/admin.module';
import { StreamModule } from './stream/stream.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongoUri'),
        maxPoolSize: configService.get<number>('mongoPoolSize', 10),
        serverSelectionTimeoutMS: 5000,
        connectionFactory: (connection: mongoose.Connection) => {
          if (process.env.NODE_ENV !== 'production') {
            connection.set('debug', true);
          }
          connection.on('connected', () => console.log('Mongoose connected'));
          connection.on('error', (err) =>
            console.error('Mongoose connection error', err),
          );
          connection.on('disconnected', () =>
            console.warn('Mongoose disconnected'),
          );
          return connection;
        },
      }),
      inject: [ConfigService],
    }),
    HealthModule,
    SharedModule,
    KafkaTestModule,
    StatusModule,
    OrganizationModule,
    UploadModule,
    ProcessorModule,
    AdminModule,
    StreamModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
