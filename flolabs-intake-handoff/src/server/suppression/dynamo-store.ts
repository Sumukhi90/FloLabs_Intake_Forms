import { createHash } from 'node:crypto';
import { normalizeEmail, normalizeTopic } from './normalize';
import type { SuppressionDynamoClient, SuppressionStore, SuppressionStoreOptions } from './types';

const EVENT_PREFIX = 'EVENT#';
const PROCESSED = 'PROCESSED';

const eventKey = (eventId: string) => createHash('sha256').update(eventId).digest('hex');
const scopeKey = (reason: string, scope: string, topic?: string) =>
  scope === 'TOPIC'
    ? `MARKETING#TOPIC#${encodeURIComponent(topic ?? '')}#${reason}`
    : `MARKETING#ALL#${reason}`;

export function createDynamoSuppressionStore(
  client: SuppressionDynamoClient,
  { tableName, now = () => new Date() }: SuppressionStoreOptions,
): SuppressionStore {
  return {
    async isSuppressed(email, topic) {
      const normalizedEmail = normalizeEmail(email);
      const normalizedTopic = topic === undefined ? undefined : normalizeTopic(topic);
      const prefixes = ['MARKETING#ALL#', ...(normalizedTopic ? [`MARKETING#TOPIC#${encodeURIComponent(normalizedTopic)}#`] : [])];
      const results = await Promise.all(
        prefixes.map((prefix) =>
          client.query({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            FilterExpression: '#status = :active',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':pk': `EMAIL#${normalizedEmail}`, ':prefix': prefix, ':active': 'ACTIVE' },
            ConsistentRead: true,
          }),
        ),
      );
      return results.some((result) => (result.Items?.length ?? 0) > 0);
    },

    async recordSuppression(record) {
      const normalizedEmail = normalizeEmail(record.email);
      if (record.normalizedEmail !== normalizedEmail) throw new Error('NORMALIZED_EMAIL_MISMATCH');
      const topic = record.scope === 'TOPIC' ? normalizeTopic(record.topic ?? '') : undefined;

      await client.update({
        TableName: tableName,
        Key: { pk: `EMAIL#${normalizedEmail}`, sk: scopeKey(record.reason, record.scope, topic) },
        UpdateExpression:
          'SET #status = :active, #reason = :reason, #scope = :scope, #source = :source, eventId = :eventId, updatedAt = :now, createdAt = if_not_exists(createdAt, :now), occurredAt = :occurredAt, topic = :topic',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#reason': 'reason',
          '#scope': 'scope',
          '#source': 'source',
        },
        ExpressionAttributeValues: {
          ':active': 'ACTIVE',
          ':reason': record.reason,
          ':scope': record.scope,
          ':source': record.source,
          ':eventId': eventKey(record.eventId),
          ':now': now().toISOString(),
          ':occurredAt': record.occurredAt ?? null,
          ':topic': topic ?? null,
        },
      });
    },

    async isEventProcessed(id) {
      const result = await client.get({
        TableName: tableName,
        Key: { pk: `${EVENT_PREFIX}${eventKey(id)}`, sk: PROCESSED },
        ConsistentRead: true,
      });
      return result.Item?.status === 'PROCESSED';
    },

    async markEventProcessed(id) {
      try {
        const processedAt = now();
        await client.put({
          TableName: tableName,
          Item: {
            pk: `${EVENT_PREFIX}${eventKey(id)}`,
            sk: PROCESSED,
            status: PROCESSED,
            processedAt: processedAt.toISOString(),
            expiresAt: Math.floor(processedAt.getTime() / 1000) + 365 * 24 * 60 * 60,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },
  };
}
