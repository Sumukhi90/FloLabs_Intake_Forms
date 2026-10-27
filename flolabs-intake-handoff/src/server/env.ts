import 'server-only';
import { z } from 'zod';

// Server environment, validated once.

/**
 * Cloudflare's published Turnstile test keys (always pass). Used only outside production
 * when no keys are configured, so local development works without real keys.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_KEYS = {
  siteKey: '1x00000000000000000000AA',
  secretKey: '1x0000000000000000000000000000000AA',
} as const;

// Twenty over HTTPS, or plain HTTP only on this machine (production: the forms app and Twenty
// share the droplet, TWENTY_BASE_URL=http://127.0.0.1:3000). Remote HTTP is refused.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
export const isAllowedTwentyUrl = (value: string): boolean => {
  const url = new URL(value);
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
};

const emailSettingsShape = {
  CRM_EMAIL_IMAP_HOST: z.string().min(1).optional(),
  CRM_EMAIL_IMAP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  CRM_EMAIL_IMAP_USERNAME: z.string().email().optional(),
  CRM_EMAIL_IMAP_PASSWORD: z.string().min(1).optional(),
  CRM_EMAIL_SMTP_HOST: z.string().min(1).optional(),
  CRM_EMAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  CRM_EMAIL_SMTP_USERNAME: z.string().email().optional(),
  CRM_EMAIL_SMTP_PASSWORD: z.string().min(1).optional(),
  CRM_EMAIL_ALLOWED_RECIPIENTS: z.string().optional(),
  CRM_EMAIL_DATABASE_PATH: z.string().min(1).optional(),
  CRM_EMAIL_TEST_COMMANDS_ENABLED: z.enum(['true', 'false']).optional(),
  CRM_EMAIL_TEST_BLOCK_RECIPIENT: z.string().email().optional(),
};
const emailSettingsSchema = z.object(emailSettingsShape);
type EmailSettings = z.infer<typeof emailSettingsSchema>;
type EmailConfigIssue = { path: keyof EmailSettings; message: string };

function emailConfigIssues(env: EmailSettings): EmailConfigIssue[] {
  const issues: EmailConfigIssue[] = [];
  const imapSettings = [env.CRM_EMAIL_IMAP_HOST, env.CRM_EMAIL_IMAP_PORT, env.CRM_EMAIL_IMAP_USERNAME, env.CRM_EMAIL_IMAP_PASSWORD];
  if (imapSettings.some(Boolean) && !imapSettings.every(Boolean)) {
    issues.push({ path: 'CRM_EMAIL_IMAP_PASSWORD', message: 'all IMAP settings must be configured together' });
  }
  const smtpSettings = [env.CRM_EMAIL_SMTP_HOST, env.CRM_EMAIL_SMTP_PORT, env.CRM_EMAIL_SMTP_USERNAME, env.CRM_EMAIL_SMTP_PASSWORD];
  if (smtpSettings.some(Boolean) && !smtpSettings.every(Boolean)) {
    issues.push({ path: 'CRM_EMAIL_SMTP_PASSWORD', message: 'all SMTP settings must be configured together' });
  }
  if ((env.CRM_EMAIL_IMAP_HOST || env.CRM_EMAIL_SMTP_HOST) && !env.CRM_EMAIL_DATABASE_PATH) {
    issues.push({ path: 'CRM_EMAIL_DATABASE_PATH', message: 'required when email transport is configured' });
  }
  if (env.CRM_EMAIL_SMTP_HOST) {
    const recipients = env.CRM_EMAIL_ALLOWED_RECIPIENTS?.split(',').map((address) => address.trim()).filter(Boolean) ?? [];
    if (!recipients.length || !recipients.every((address) => z.string().email().safeParse(address).success)) {
      issues.push({ path: 'CRM_EMAIL_ALLOWED_RECIPIENTS', message: 'a comma-separated list of valid test recipients is required for SMTP' });
    }
  }
  if (env.CRM_EMAIL_IMAP_PORT && env.CRM_EMAIL_IMAP_PORT !== 993) {
    issues.push({ path: 'CRM_EMAIL_IMAP_PORT', message: 'IMAP must use port 993 with implicit TLS' });
  }
  if (env.CRM_EMAIL_SMTP_PORT && env.CRM_EMAIL_SMTP_PORT !== 465) {
    issues.push({ path: 'CRM_EMAIL_SMTP_PORT', message: 'SMTP must use port 465 with implicit TLS' });
  }
  return issues;
}

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TWENTY_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .refine(isAllowedTwentyUrl, 'must be https, or http on 127.0.0.1 or localhost')
    .transform((url) => url.replace(/\/+$/, '')),
  TWENTY_API_KEY: z.string().min(20),
  TURNSTILE_SITE_KEY: z.string().min(10).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(10).optional(),
  // Header carrying the real client IP when the app runs behind a proxy (T7 rate limits).
  // Unset: no header is trusted (local development: all requests share one IP bucket).
  // Required in production: without it every visitor shares one bucket, so the per-IP limit
  // (RATE_LIMITS.perIp) would apply to the whole site (T15).
  TRUSTED_IP_HEADER: z.enum(['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']).optional(),
  // Signs Form 1-3 links (T10). At least 32 characters; rotating it revokes all unused links.
  LINK_TOKEN_SECRET: z.string().min(32).optional(),
  AWS_REGION: z.string().min(1).optional(),
  SUPPRESSION_TABLE_NAME: z.string().min(3).optional(),
  ...emailSettingsShape,
});

const envSchema = baseSchema
  .superRefine((env, context) => {
    for (const issue of emailConfigIssues(env)) {
      context.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  })
  .refine((env) => Boolean(env.AWS_REGION) === Boolean(env.SUPPRESSION_TABLE_NAME), {
    path: ['SUPPRESSION_TABLE_NAME'],
    message: 'AWS_REGION and SUPPRESSION_TABLE_NAME must be configured together',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.TURNSTILE_SITE_KEY, {
    path: ['TURNSTILE_SITE_KEY'],
    message: 'required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.TURNSTILE_SECRET_KEY, {
    path: ['TURNSTILE_SECRET_KEY'],
    message: 'required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.LINK_TOKEN_SECRET, {
    path: ['LINK_TOKEN_SECRET'],
    message: 'required in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.TRUSTED_IP_HEADER, {
    path: ['TRUSTED_IP_HEADER'],
    message: 'required in production',
  })
  .transform(({ TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, ...env }) => ({
    ...env,
    TURNSTILE_SITE_KEY: TURNSTILE_SITE_KEY ?? TURNSTILE_TEST_KEYS.siteKey,
    TURNSTILE_SECRET_KEY: TURNSTILE_SECRET_KEY ?? TURNSTILE_TEST_KEYS.secretKey,
  }));

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(readonly invalidVariables: string[]) {
    // Names only, never values.
    super(`Invalid or missing environment variables: ${invalidVariables.join(', ')}`);
    this.name = 'EnvError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError([...new Set(result.error.issues.map((issue) => issue.path.join('.')))]);
  }
  return result.data;
}

export function parseEmailEnvironment(source: Record<string, string | undefined>): EmailSettings {
  const result = emailSettingsSchema.safeParse(source);
  if (!result.success) {
    throw new EnvError([...new Set(result.error.issues.map((issue) => issue.path.join('.')))]);
  }
  const issues = emailConfigIssues(result.data);
  if (issues.length) throw new EnvError([...new Set(issues.map((issue) => issue.path))]);
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
