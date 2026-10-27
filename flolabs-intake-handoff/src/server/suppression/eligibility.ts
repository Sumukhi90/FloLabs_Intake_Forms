import 'server-only';
import type { TwentyClient } from '../twenty/client';
import { normalizeEmail, normalizeTopic } from './normalize';
import type { SuppressionStore } from './types';

export type MarketingEligibility =
  | { allowed: true; personId: string }
  | { allowed: false; reason: 'INVALID_EMAIL' | 'INVALID_TOPIC' | 'NO_CONSENT' | 'SUPPRESSED' | 'LOOKUP_FAILED' };

export async function checkMarketingEligibility(
  email: string,
  topic: string,
  deps: {
    people: Pick<TwentyClient, 'findPersonByEmail'>;
    suppressions: Pick<SuppressionStore, 'isSuppressed'>;
  },
): Promise<MarketingEligibility> {
  let normalized: string;
  try {
    normalized = normalizeEmail(email);
  } catch {
    return { allowed: false, reason: 'INVALID_EMAIL' };
  }
  let normalizedTopic: string;
  try {
    normalizedTopic = normalizeTopic(topic);
  } catch {
    return { allowed: false, reason: 'INVALID_TOPIC' };
  }

  let person: Awaited<ReturnType<TwentyClient['findPersonByEmail']>>;
  try {
    person = await deps.people.findPersonByEmail(normalized);
  } catch {
    return { allowed: false, reason: 'LOOKUP_FAILED' };
  }
  if (!person || person.communicationConsent !== true) return { allowed: false, reason: 'NO_CONSENT' };
  try {
    if (await deps.suppressions.isSuppressed(normalized, normalizedTopic)) return { allowed: false, reason: 'SUPPRESSED' };
  } catch {
    return { allowed: false, reason: 'LOOKUP_FAILED' };
  }
  return { allowed: true, personId: person.id };
}
