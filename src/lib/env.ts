import { z } from 'zod';

const secret = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length >= 32, 'must be 32+ random bytes, base64');

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.url(),
  DIRECT_DATABASE_URL: z.url(),

  SESSION_PEPPER: secret,
  FLAG_HMAC_KEY: secret,
  VARIANT_HMAC_KEY: secret,
  COORD_HMAC_KEY: secret,
  REVEAL_ENC_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be exactly 32 bytes, base64'),
  CSRF_SECRET: secret,

  FLAG_PREFIX: z.string().regex(/^[A-Za-z0-9_]+$/),
  EVENT_TIMEZONE: z.string().min(1),
  MAX_SESSIONS_PER_TEAM: z.coerce.number().int().positive(),
  REALTIME_CHANNEL_PREFIX: z.string().min(1),

  ARGON2_MEMORY_KIB: z.coerce.number().int().positive(),
  ARGON2_TIME_COST: z.coerce.number().int().positive(),
  ARGON2_PARALLELISM: z.coerce.number().int().positive(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Names and reasons only: the values are secrets.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
}

export const env = parsed.data;
