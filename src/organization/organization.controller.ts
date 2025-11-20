// src/organization/organization.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { OrgResponseDto } from './dto/org-response.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(SuperAdminGuard) // protect with SuperAdminApiKey
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: 'Create organization (super-admin only)' })
  async create(@Body() dto: CreateOrganizationDto): Promise<OrgResponseDto> {
    const saved = await this.orgService.createOrganization(dto);

    // Map to response DTO (remove passwordHash if present)
    const response: OrgResponseDto = {
      id: saved._id?.toString?.() ?? saved.id,
      email: saved.email,
      apiKey: saved.apiKey,
      name: saved.name,
      videoProcessConfig: saved.videoProcessConfig,
      streamConfig: saved.streamConfig,
      createdAt: saved.createdAt?.toISOString?.(),
      updatedAt: saved.updatedAt?.toISOString?.(),
    };

    return response;
  }
}
