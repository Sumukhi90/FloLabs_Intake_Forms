import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeTopic } from './normalize';

describe('normalizeEmail', () => {
  it('trims and lowercases without altering plus tags', () => {
    expect(normalizeEmail('  Person+Tag@Example.COM ')).toBe('person+tag@example.com');
  });

  describe('normalizeTopic', () => {
    it('trims topics consistently for suppression lookups', () => {
      expect(normalizeTopic('  newsletter  ')).toBe('newsletter');
    });

    it.each(['', '  ', 'x'.repeat(129), 'news\nletter'])('rejects invalid suppression topics', (topic) => {
      expect(() => normalizeTopic(topic)).toThrow('INVALID_TOPIC');
    });
  });

  it.each(['', 'not-an-email', 'person@', '@example.com', 'person @example.com', 'x'.repeat(250) + '@a.com'])(
    'rejects invalid email input',
    (email) => expect(() => normalizeEmail(email)).toThrow('INVALID_EMAIL'),
  );
});
