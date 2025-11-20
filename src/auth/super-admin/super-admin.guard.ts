// src/auth/super-admin.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req: Request = context.switchToHttp().getRequest<Request>();

    const apiKeyFromGet =
      req.get('SuperAdminApiKey') || req.get('Super-Admin-Api-Key');
    const apiKeyFromHeaders =
      (req.headers['superadminapikey'] as string | undefined) ||
      (req.headers['super-admin-api-key'] as string | undefined);

    const apiKey = apiKeyFromGet ?? apiKeyFromHeaders;

    const VALID_KEY = process.env.SUPER_ADMIN_KEY || 'sample-super-admin-key';

    if (!apiKey || apiKey !== VALID_KEY) {
      throw new UnauthorizedException('Invalid or missing SuperAdminApiKey');
    }

    return true;
  }
}
