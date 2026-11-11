import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

/** Tells the storefront to refresh cached pages after an admin change. Fire and forget. */
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger('Revalidate');

  tags(tags: string[]) {
    if (!config.REVALIDATE_URL || !tags.length) return;
    fetch(config.REVALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': config.INTERNAL_SECRET },
      body: JSON.stringify({ tags: [...new Set(tags)] }),
      signal: AbortSignal.timeout(5000),
    }).catch((err) => this.logger.warn(`Storefront refresh failed: ${err.message}`));
  }
}
