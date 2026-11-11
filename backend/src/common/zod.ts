import { Injectable, PipeTransform } from '@nestjs/common';
import { z, ZodType } from 'zod';
import { unprocessable } from './errors';

/** Validates a request body or query with a Zod schema; unknown fields are stripped. */
@Injectable()
export class ZodPipe<T extends ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw unprocessable(
        'VALIDATION_FAILED',
        'Some fields need attention.',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}

export const zv = <T extends ZodType>(schema: T) => new ZodPipe(schema);

// Reusable field schemas
export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(200);
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.'));
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode.');
export const password = z.string().min(10, 'Use at least 10 characters.').max(200);
export const id = z.string().uuid();
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone,
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  landmark: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode,
  floor: z.coerce.number().int().min(0).max(80).optional().nullable(),
  hasLift: z.boolean().optional().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
