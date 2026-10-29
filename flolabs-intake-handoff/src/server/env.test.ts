import { describe, expect, it } from 'vitest';
import { EnvError, parseEmailEnvironment, parseEnv, TURNSTILE_TEST_KEYS } from './env';

const validKey = 'k'.repeat(40);

describe('parseEnv', () => {
  it('accepts a valid environment and strips trailing slashes from the base URL', () => {
    const env = parseEnv({ TWENTY_BASE_URL: 'https://crm.example.com//', TWENTY_API_KEY: validKey });
    expect(env.TWENTY_BASE_URL).toBe('https://crm.example.com');
  });

  it('accepts suppression storage only when both AWS settings are present', () => {
    const base = { TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey };
    expect(parseEnv({ ...base, AWS_REGION: 'eu-west-1', SUPPRESSION_TABLE_NAME: 'flolabs-dev-email-suppressions' }))
      .toMatchObject({ AWS_REGION: 'eu-west-1', SUPPRESSION_TABLE_NAME: 'flolabs-dev-email-suppressions' });
    expect(() => parseEnv({ ...base, AWS_REGION: 'eu-west-1' })).toThrow(/SUPPRESSION_TABLE_NAME/);
    expect(() => parseEnv({ ...base, SUPPRESSION_TABLE_NAME: 'flolabs-dev-email-suppressions' })).toThrow(
      /SUPPRESSION_TABLE_NAME/,
    );
  });

  it('names every missing variable', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    try {
      parseEnv({});
    } catch (error) {
      expect((error as EnvError).invalidVariables).toEqual(['TWENTY_BASE_URL', 'TWENTY_API_KEY']);
    }
  });

  it.each(['http://127.0.0.1:3000', 'http://localhost:3000/', 'http://127.0.0.1:8080'])(
    'allows plain HTTP to Twenty on this machine: %s',
    (url) => {
      expect(parseEnv({ TWENTY_BASE_URL: url, TWENTY_API_KEY: validKey }).TWENTY_BASE_URL).toBe(url.replace(/\/$/, ''));
    },
  );

  it.each(['http://10.0.0.5:3000', 'http://127.0.0.1.example.com:3000', 'http://localhost@crm.example.com', 'ftp://127.0.0.1:3000'])(
    'rejects remote or non-web HTTP: %s',
    (url) => {
      expect(() => parseEnv({ TWENTY_BASE_URL: url, TWENTY_API_KEY: validKey })).toThrow(/TWENTY_BASE_URL/);
    },
  );

  it('rejects a non-https base URL', () => {
    expect(() => parseEnv({ TWENTY_BASE_URL: 'http://crm.example.com', TWENTY_API_KEY: validKey })).toThrow(
      /TWENTY_BASE_URL/,
    );
  });

  it('never includes variable values in the error', () => {
    const secret = 'short-secret-value';
    try {
      parseEnv({ TWENTY_BASE_URL: 'not a url', TWENTY_API_KEY: secret });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
      expect(String((error as Error).message)).not.toContain('not a url');
    }
  });

  it('uses the Cloudflare Turnstile test keys outside production when none are set', () => {
    const env = parseEnv({ TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey });
    expect([env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY]).toEqual([TURNSTILE_TEST_KEYS.siteKey, TURNSTILE_TEST_KEYS.secretKey]);
  });

  it('requires real Turnstile keys, the link secret and the client IP header in production', () => {
    const production = { NODE_ENV: 'production', TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey };
    try {
      parseEnv(production);
      expect.unreachable();
    } catch (error) {
      expect((error as EnvError).invalidVariables).toEqual(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'LINK_TOKEN_SECRET', 'TRUSTED_IP_HEADER']);
    }
    const env = parseEnv({
      ...production,
      TURNSTILE_SITE_KEY: '0x4AAAAAAAreal',
      TURNSTILE_SECRET_KEY: '0x4AAAAAAAsecret',
      LINK_TOKEN_SECRET: 's'.repeat(32),
      TRUSTED_IP_HEADER: 'cf-connecting-ip',
    });
    expect(env.TURNSTILE_SITE_KEY).toBe('0x4AAAAAAAreal');
  });

  it('only accepts known proxy headers for the client IP', () => {
    const base = { TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey };
    expect(parseEnv({ ...base, TRUSTED_IP_HEADER: 'cf-connecting-ip' }).TRUSTED_IP_HEADER).toBe('cf-connecting-ip');
    expect(() => parseEnv({ ...base, TRUSTED_IP_HEADER: 'x-anything' })).toThrow(/TRUSTED_IP_HEADER/);
  });

  it('rejects a link secret shorter than 32 characters', () => {
    expect(() => parseEnv({ TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey, LINK_TOKEN_SECRET: 'short' })).toThrow(/LINK_TOKEN_SECRET/);
  });

  it('accepts complete implicit-TLS mailbox configuration only with a test database and recipient allowlist', () => {
    const base = {
      TWENTY_BASE_URL: 'https://crm.example.com',
      TWENTY_API_KEY: validKey,
      CRM_EMAIL_IMAP_HOST: 'mail.flolabsinnovations.com',
      CRM_EMAIL_IMAP_PORT: '993',
      CRM_EMAIL_IMAP_USERNAME: 'hr@flolabsinnovations.com',
      CRM_EMAIL_IMAP_PASSWORD: 'private-value',
      CRM_EMAIL_ALLOWED_RECIPIENTS: 'authorized-test@example.com, test@example.com',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
      CRM_EMAIL_TEST_COMMANDS_ENABLED: 'true',
      CRM_EMAIL_TEST_BLOCK_RECIPIENT: 'blocked-test@example.com',
    };
    expect(parseEnv(base)).toMatchObject({
      CRM_EMAIL_IMAP_PORT: 993,
      CRM_EMAIL_IMAP_HOST: 'mail.flolabsinnovations.com',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
    });
    expect(parseEmailEnvironment({
      CRM_EMAIL_TEST_BLOCK_RECIPIENT: 'blocked-test@example.com',
    }).CRM_EMAIL_TEST_BLOCK_RECIPIENT).toBe('blocked-test@example.com');
    expect(() => parseEmailEnvironment({
      CRM_EMAIL_TEST_BLOCK_RECIPIENT: 'not-an-address',
    })).toThrow(/CRM_EMAIL_TEST_BLOCK_RECIPIENT/);
  });

  it.each([
    { CRM_EMAIL_IMAP_PASSWORD: 'private-value' },
    { CRM_EMAIL_IMAP_PORT: '143' },
    { MAILJET_API_KEY: 'partial-key', MAILJET_API_SECRET: 'partial-secret', MAILJET_FROM_EMAIL: 'hr@flolabsinnovations.com', MAILJET_REPLY_TO_EMAIL: 'hr@flolabsinnovations.com', CRM_EMAIL_ALLOWED_RECIPIENTS: 'not-an-address', CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite' },
  ])('rejects incomplete, non-TLS, or invalid mailbox settings', (mailSettings) => {
    const base = { TWENTY_BASE_URL: 'https://crm.example.com', TWENTY_API_KEY: validKey };
    expect(() => parseEnv({ ...base, ...mailSettings })).toThrow(EnvError);
  });

  it('does not include mailbox passwords in configuration errors', () => {
    const password = 'do-not-disclose-this-value';
    try {
      parseEnv({
        TWENTY_BASE_URL: 'https://crm.example.com',
        TWENTY_API_KEY: validKey,
        CRM_EMAIL_IMAP_HOST: 'mail.flolabsinnovations.com',
        CRM_EMAIL_IMAP_USERNAME: 'hr@flolabsinnovations.com',
        CRM_EMAIL_IMAP_PASSWORD: password,
        CRM_EMAIL_IMAP_PORT: '993',
        MAILJET_API_KEY: 'test-key',
        MAILJET_API_SECRET: 'test-secret',
        MAILJET_FROM_EMAIL: 'hr@flolabsinnovations.com',
        MAILJET_REPLY_TO_EMAIL: 'hr@flolabsinnovations.com',
        CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(password);
      expect(String(error)).toContain('CRM_EMAIL_ALLOWED_RECIPIENTS');
    }
  });

  it('validates mailbox sync configuration without requiring unrelated Twenty credentials', () => {
    const env = parseEmailEnvironment({
      CRM_EMAIL_IMAP_HOST: 'mail.flolabsinnovations.com',
      CRM_EMAIL_IMAP_PORT: '993',
      CRM_EMAIL_IMAP_USERNAME: 'hr@flolabsinnovations.com',
      CRM_EMAIL_IMAP_PASSWORD: 'private-value',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
      CRM_EMAIL_TEST_COMMANDS_ENABLED: 'true',
    });
    expect(env.CRM_EMAIL_IMAP_USERNAME).toBe('hr@flolabsinnovations.com');
    expect(() => parseEmailEnvironment({ CRM_EMAIL_IMAP_PASSWORD: 'private-value' })).toThrow(EnvError);
  });

  it('accepts complete Mailjet HR configuration with an allowlist and local store', () => {
    const env = parseEmailEnvironment({
      MAILJET_API_KEY: 'test-mailjet-key',
      MAILJET_API_SECRET: 'private-mailjet-secret',
      MAILJET_FROM_EMAIL: 'hr@flolabsinnovations.com',
      MAILJET_REPLY_TO_EMAIL: 'hr@flolabsinnovations.com',
      CRM_EMAIL_ALLOWED_RECIPIENTS: 'authorized-test@example.com',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
    });
    expect(env).toMatchObject({
      MAILJET_FROM_EMAIL: 'hr@flolabsinnovations.com',
      MAILJET_REPLY_TO_EMAIL: 'hr@flolabsinnovations.com',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
    });
  });

  it('rejects partial Mailjet configuration, non-HR sender, or missing test allowlist', () => {
    expect(() => parseEmailEnvironment({ MAILJET_API_KEY: 'test-mailjet-key' })).toThrow(/MAILJET_API_SECRET/);
    expect(() => parseEmailEnvironment({
      MAILJET_API_KEY: 'test-mailjet-key',
      MAILJET_API_SECRET: 'private-mailjet-secret',
      MAILJET_FROM_EMAIL: 'someone@example.com',
      MAILJET_REPLY_TO_EMAIL: 'hr@flolabsinnovations.com',
      CRM_EMAIL_ALLOWED_RECIPIENTS: 'authorized-test@example.com',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
    })).toThrow(/MAILJET_FROM_EMAIL/);
    expect(() => parseEmailEnvironment({
      MAILJET_API_KEY: 'test-mailjet-key',
      MAILJET_API_SECRET: 'private-mailjet-secret',
      MAILJET_FROM_EMAIL: 'hr@flolabsinnovations.com',
      MAILJET_REPLY_TO_EMAIL: 'hr@flolabsinnovations.com',
      CRM_EMAIL_DATABASE_PATH: '.local/email.sqlite',
    })).toThrow(/CRM_EMAIL_ALLOWED_RECIPIENTS/);
  });

  it('accepts an explicit false value for disabled email test commands', () => {
    expect(parseEnv({
      TWENTY_BASE_URL: 'https://crm.example.com',
      TWENTY_API_KEY: validKey,
      CRM_EMAIL_TEST_COMMANDS_ENABLED: 'false',
    }).CRM_EMAIL_TEST_COMMANDS_ENABLED).toBe('false');
  });
});
