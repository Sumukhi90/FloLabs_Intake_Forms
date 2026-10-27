import { describe, expect, it } from 'vitest';
import type { SuppressionDynamoClient } from './types';
import { createDynamoSuppressionStore } from './dynamo-store';

class TestDynamo implements SuppressionDynamoClient {
  readonly items = new Map<string, Record<string, unknown>>();
  readonly calls: { method: string; input: Record<string, unknown> }[] = [];

  private key(input: Record<string, unknown>) {
    const value = input.Key as { pk: string; sk: string };
    return `${value.pk}|${value.sk}`;
  }

  async get(input: Record<string, unknown>) {
    this.calls.push({ method: 'get', input });
    const item = this.items.get(this.key(input));
    return item ? { Item: item } : {};
  }

  async query(input: Record<string, unknown>) {
    this.calls.push({ method: 'query', input });
    const values = input.ExpressionAttributeValues as Record<string, string>;
    const items = [...this.items.values()].filter(
      (item) =>
        item.pk === values[':pk'] &&
        typeof item.sk === 'string' &&
        item.sk.startsWith(values[':prefix']!) &&
        item.status === values[':active'],
    );
    return { Items: items };
  }

  async update(input: Record<string, unknown>) {
    this.calls.push({ method: 'update', input });
    const key = input.Key as { pk: string; sk: string };
    const values = input.ExpressionAttributeValues as Record<string, unknown>;
    const item = this.items.get(`${key.pk}|${key.sk}`) ?? { ...key };
    item.status = values[':active'];
    item.reason = values[':reason'];
    item.scope = values[':scope'];
    item.source = values[':source'];
    item.eventId = values[':eventId'];
    this.items.set(`${key.pk}|${key.sk}`, item);
  }

  async put(input: Record<string, unknown>) {
    this.calls.push({ method: 'put', input });
    const item = input.Item as Record<string, unknown>;
    const key = `${item.pk}|${item.sk}`;
    if (this.items.has(key)) {
      const error = new Error('conditional check');
      error.name = 'ConditionalCheckFailedException';
      throw error;
    }
    this.items.set(key, item);
  }
}

describe('DynamoDB suppression store', () => {
  it('stores normalized suppression records durably under scoped keys and reads them consistently', async () => {
    const client = new TestDynamo();
    const store = createDynamoSuppressionStore(client, { tableName: 'unit-test', now: () => new Date('2026-10-26T00:00:00Z') });
    await store.recordSuppression({
      email: ' Person+tag@Example.com ',
      normalizedEmail: 'person+tag@example.com',
      reason: 'UNSUBSCRIBED',
      scope: 'TOPIC',
      topic: ' newsletter ',
      eventId: 'sns-event-1',
      source: 'UNSUBSCRIBE',
    });
    await expect(store.isSuppressed('PERSON+TAG@example.com', 'newsletter')).resolves.toBe(true);
    await expect(store.isSuppressed('PERSON+TAG@example.com', 'other')).resolves.toBe(false);

    const update = client.calls.find((call) => call.method === 'update')!.input;
    expect(update.TableName).toBe('unit-test');
    expect(update.Key).toEqual({
      pk: 'EMAIL#person+tag@example.com',
      sk: 'MARKETING#TOPIC#newsletter#UNSUBSCRIBED',
    });
    const values = update.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[':eventId']).toMatch(/^[a-f0-9]{64}$/);
    expect(values[':eventId']).not.toBe('sns-event-1');
    expect(client.calls.filter((call) => call.method === 'query')).toHaveLength(4);
  });

  it('keeps event markers idempotent and hashes source event ids before storage', async () => {
    const client = new TestDynamo();
    const store = createDynamoSuppressionStore(client, { tableName: 'unit-test' });
    await expect(store.isEventProcessed('topic:sns-id')).resolves.toBe(false);
    await expect(store.markEventProcessed('topic:sns-id')).resolves.toBe(true);
    await expect(store.isEventProcessed('topic:sns-id')).resolves.toBe(true);
    await expect(store.markEventProcessed('topic:sns-id')).resolves.toBe(false);
    const eventKey = client.calls.find((call) => call.method === 'put')!.input.Item as Record<string, unknown>;
    expect(eventKey.pk).toMatch(/^EVENT#[a-f0-9]{64}$/);
    expect(eventKey.pk).not.toContain('topic:sns-id');
    expect(eventKey.expiresAt).toBeGreaterThan(0);
  });

  it('rejects inconsistent normalized keys and missing topic scopes', async () => {
    const store = createDynamoSuppressionStore(new TestDynamo(), { tableName: 'unit-test' });
    await expect(
      store.recordSuppression({
        email: 'Person@example.com',
        normalizedEmail: 'other@example.com',
        reason: 'HARD_BOUNCE',
        scope: 'ALL_MARKETING',
        eventId: 'evt',
        source: 'SES_EVENT',
      }),
    ).rejects.toThrow('NORMALIZED_EMAIL_MISMATCH');
    await expect(
      store.recordSuppression({
        email: 'Person@example.com',
        normalizedEmail: 'person@example.com',
        reason: 'UNSUBSCRIBED',
        scope: 'TOPIC',
        eventId: 'evt',
        source: 'UNSUBSCRIBE',
      }),
    ).rejects.toThrow('INVALID_TOPIC');
  });
});
