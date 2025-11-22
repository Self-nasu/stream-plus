// src/organization/organization.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto/create-organization.dto';
import { SuperAdminGuard } from '../auth/super-admin/super-admin.guard';
import { OrgResponseDto } from './dto/org-response.dto/org-response.dto';

@ApiTags('Organizations')
@ApiSecurity('super_admin_key')
@Controller('organizations')
@UseGuards(SuperAdminGuard) // protect with SuperAdminApiKey
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  @ApiOperation({ 
    summary: 'Create a new organization',
    description: 'Creates a new organization with hashed password and generates an API key. Requires super admin authentication.'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Organization created successfully',
    type: OrgResponseDto
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid super admin key' })
  @ApiResponse({ status: 409, description: 'Organization with this email already exists' })
  async create(@Body() dto: CreateOrganizationDto): Promise<OrgResponseDto> {
    // The request body is validated by Nest's validation pipe in runtime.
    // Disable the rule here to avoid a false-positive about "unsafe" runtime
    // data being passed into a typed service method.
    const saved = await this.orgService.createOrganization(dto);
    return saved;
  }
}
