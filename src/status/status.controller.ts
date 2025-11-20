// src/status/status.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { KafkaService } from '../shared/services/kafka/kafka.service';
import { SuperAdminGuard } from '../auth/super-admin/super-admin.guard';

@Controller('admin-status')
@UseGuards(SuperAdminGuard)
export class StatusController {
  constructor(
    @InjectConnection() private readonly mongoConn: Connection,
    private readonly kafka: KafkaService,
  ) {}

  @Get()
  getStatus() {
    const state: number = this.mongoConn.readyState;
    const mongoStatus: 'connected' | 'disconnected' =
      state === 1 ? 'connected' : 'disconnected';

    const maybeIsConnected = (
      this.kafka as unknown as { isConnected?: () => boolean }
    ).isConnected;
    const kafkaStatus: 'connected' | 'disconnected' =
      typeof maybeIsConnected === 'function' &&
      maybeIsConnected.call(this.kafka)
        ? 'connected'
        : 'disconnected';

    return {
      ok: mongoStatus === 'connected' && kafkaStatus === 'connected',
      mongo: mongoStatus,
      kafka: kafkaStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
