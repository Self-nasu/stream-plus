import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';

interface RateLimitEntry {
  timestamps: number[];
}

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RateLimiterGuard.name);
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly maxRequests = 2;
  private readonly windowMs = 60 * 1000; // 1 minute

  constructor() {
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const organization = request.organization;

    if (!organization) {
      this.logger.warn('Rate limiter: No organization found in request');
      return true; // Let it pass, auth guard will handle it
    }

    const orgId = organization._id.toString();
    const now = Date.now();

    // Get or create rate limit entry
    let entry = this.store.get(orgId);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(orgId, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Check if limit exceeded
    if (entry.timestamps.length >= this.maxRequests) {
      const oldestTimestamp = entry.timestamps[0];
      const resetTime = Math.ceil((oldestTimestamp + this.windowMs - now) / 1000);
      
      this.logger.warn(
        `Rate limit exceeded for organization ${orgId}. ` +
        `${entry.timestamps.length} requests in last minute. ` +
        `Reset in ${resetTime}s`
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rate limit exceeded. Maximum ${this.maxRequests} upload requests per minute allowed.`,
          retryAfter: resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add current request timestamp
    entry.timestamps.push(now);
    
    this.logger.log(
      `Rate limit check passed for org ${orgId}: ` +
      `${entry.timestamps.length}/${this.maxRequests} requests in window`
    );

    return true;
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [orgId, entry] of this.store.entries()) {
      // Remove timestamps outside window
      entry.timestamps = entry.timestamps.filter(
        timestamp => now - timestamp < this.windowMs
      );

      // Remove entry if no recent requests
      if (entry.timestamps.length === 0) {
        this.store.delete(orgId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} rate limit entries`);
    }
  }

  // For testing/monitoring
  getStats() {
    const stats = new Map<string, { count: number; oldestRequest: number }>();
    const now = Date.now();

    for (const [orgId, entry] of this.store.entries()) {
      if (entry.timestamps.length > 0) {
        stats.set(orgId, {
          count: entry.timestamps.length,
          oldestRequest: now - entry.timestamps[0],
        });
      }
    }

    return stats;
  }
}
