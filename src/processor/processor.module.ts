import { Module } from '@nestjs/common';
import { ProcessorController } from './processor.controller';
import { ProcessorService } from './processor.service';
import { ConsumerManager } from './consumer-manager.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [ProcessorController],
  providers: [ProcessorService, ConsumerManager],
  exports: [ProcessorService, ConsumerManager],
})
export class ProcessorModule {}
