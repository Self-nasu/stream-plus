// src/organization/organization.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationSchema } from '../schemas/organization.schema';

@Module({
  imports: [
    // This registers the "Organization" model for this module
    MongooseModule.forFeature([
      { name: 'Organization', schema: OrganizationSchema },
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
