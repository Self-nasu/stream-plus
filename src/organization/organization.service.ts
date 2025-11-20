// src/organization/organization.service.ts
import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrganizationDocument } from '../schemas/organization.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto/create-organization.dto';
import { hash as bcryptHash } from 'bcrypt';
import { randomBytes } from 'crypto';

interface MongoDuplicateError {
  code: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

/**
 * Type guard: narrow unknown to a Mongo duplicate key error.
 */
function isMongoDuplicateError(err: unknown): err is MongoDuplicateError {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: unknown };
  return (
    typeof maybe.code === 'number' &&
    (maybe.code === 11000 || maybe.code === 11001 || maybe.code === 11002)
  );
}

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel('Organization')
    private readonly orgModel: Model<OrganizationDocument>,
  ) {}

  private generateApiKey(): string {
    // 16 bytes -> 32 hex characters
    return randomBytes(16).toString('hex');
  }

  /**
   * Create organization and return saved object without passwordHash.
   */
  async createOrganization(
    dto: CreateOrganizationDto,
  ): Promise<Record<string, unknown>> {
    const { email, password, name } = dto;

    // Hash password (salt rounds: 10). Tune as needed.
    const saltRounds = 10;
    const passwordHash = await bcryptHash(password, saltRounds);

    // Generate API key
    const apiKey = this.generateApiKey();

    const videoProcessConfig = {
      '240p': true,
      '360p': true,
      '480p': true,
      '720p': true,
      '1080p': false,
    };

    const streamConfig = {
      allowedDomains: ['*'],
    };

    const doc = new this.orgModel({
      email,
      passwordHash,
      apiKey,
      name,
      videoProcessConfig,
      streamConfig,
    });

    try {
      const saved = await doc.save();
      const savedObj = saved.toObject();

      // Create a shallow clone and remove `passwordHash` to avoid unused-local
      // destructuring warnings while not mutating the original Mongoose document.
      type SafeObj = Record<string, unknown> & { passwordHash?: unknown };
      const safe = JSON.parse(JSON.stringify(savedObj)) as SafeObj;
      delete safe.passwordHash;

      return safe;
    } catch (err: unknown) {
      if (isMongoDuplicateError(err)) {
        const kp = err.keyPattern;
        const kv = err.keyValue;

        let field = 'field';

        if (kp && typeof kp === 'object') {
          field = Object.keys(kp).join(', ');
        } else if (kv && typeof kv === 'object') {
          field = Object.keys(kv).join(', ');
        }

        throw new ConflictException(`${field} already exists`);
      }

      // For non-duplicate errors, don't leak internals
      throw new InternalServerErrorException('Failed to create organization');
    }
  }

  // Optional helper: find by apiKey
  async findByApiKey(apiKey: string) {
    return this.orgModel.findOne({ apiKey }).lean().exec();
  }
}
