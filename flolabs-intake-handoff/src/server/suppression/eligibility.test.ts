import { describe, expect, it, vi } from 'vitest';
import type { Person } from '../twenty/types';
import { checkMarketingEligibility } from './eligibility';

const person: Person = {
  id: '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b',
  name: { firstName: 'Synthetic', lastName: 'Contact' },
  emails: { primaryEmail: 'person@example.com', additionalEmails: [] },
  phones: null,
  location: null,
  linkedinLink: null,
  education: null,
  communicationConsent: true,
};

function deps(options: { person?: Person | null; suppressed?: boolean; lookupError?: boolean; suppressionError?: boolean } = {}) {
  const findPersonByEmail = vi.fn(async () => {
    if (options.lookupError) throw new Error('private lookup failure');
    return options.person === undefined ? person : options.person;
  });
  const isSuppressed = vi.fn(async () => {
    if (options.suppressionError) throw new Error('private store failure');
    return options.suppressed ?? false;
  });
  return { people: { findPersonByEmail }, suppressions: { isSuppressed } };
}

describe('marketing send eligibility', () => {
  it('requires consent and no active suppression before a marketing send', async () => {
    await expect(checkMarketingEligibility(' PERSON@example.com ', 'newsletter', deps())).resolves.toEqual({
      allowed: true,
      personId: person.id,
    });
  });

  it('blocks unknown and opted-out people without querying suppression for consent failures', async () => {
    const noPerson = deps({ person: null });
    const optedOut = deps({ person: { ...person, communicationConsent: false } });
    await expect(checkMarketingEligibility('person@example.com', 'newsletter', noPerson)).resolves.toEqual({
      allowed: false,
      reason: 'NO_CONSENT',
    });
    await expect(checkMarketingEligibility('person@example.com', 'newsletter', optedOut)).resolves.toEqual({
      allowed: false,
      reason: 'NO_CONSENT',
    });
    expect(noPerson.suppressions.isSuppressed).not.toHaveBeenCalled();
  });

  it('blocks a consented person if an all-marketing or applicable suppression exists', async () => {
    await expect(checkMarketingEligibility('person@example.com', 'newsletter', deps({ suppressed: true }))).resolves.toEqual({
      allowed: false,
      reason: 'SUPPRESSED',
    });
  });

  it('fails closed for invalid addresses and either backing-store failure', async () => {
    const valid = deps();
    await expect(checkMarketingEligibility('not-an-email', 'newsletter', valid)).resolves.toEqual({
      allowed: false,
      reason: 'INVALID_EMAIL',
    });
    await expect(checkMarketingEligibility('person@example.com', 'newsletter', deps({ lookupError: true }))).resolves.toEqual({
      allowed: false,
      reason: 'LOOKUP_FAILED',
    });
    await expect(checkMarketingEligibility('person@example.com', 'newsletter', deps({ suppressionError: true }))).resolves.toEqual({
      allowed: false,
      reason: 'LOOKUP_FAILED',
    });
  });

  it('normalizes valid topics and rejects invalid topics before CRM or suppression lookups', async () => {
    const valid = deps();
    await expect(checkMarketingEligibility('person@example.com', ' newsletter ', valid)).resolves.toEqual({
      allowed: true,
      personId: person.id,
    });
    expect(valid.suppressions.isSuppressed).toHaveBeenCalledWith('person@example.com', 'newsletter');

    const invalid = deps();
    await expect(checkMarketingEligibility('person@example.com', ' newsletter\n', invalid)).resolves.toEqual({
      allowed: false,
      reason: 'INVALID_TOPIC',
    });
    expect(invalid.people.findPersonByEmail).not.toHaveBeenCalled();
    expect(invalid.suppressions.isSuppressed).not.toHaveBeenCalled();
  });
});
