import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly organizationService: OrganizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const organization = await this.organizationService.findByApiKey(apiKey);
    if (!organization) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.organization = organization;
    return true;
  }
}
