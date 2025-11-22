import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ProcessorModule } from '../processor/processor.module';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [ProcessorModule, OrganizationModule],
  controllers: [AdminController],
})
export class AdminModule {}
