import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { ZodType } from 'zod'

import type { SessionId, Sequence } from '../../../domain'
import {
  SegmentItemSchema,
  SessionItemSchema,
  type SegmentItem,
  type SessionItem,
} from './items'
import { segmentKey, sessionKey, type DynamoDbKey } from './keys'

export interface RepositoryDependencies {
  client: DynamoDBDocumentClient
  tableName: string
}

export type ReadItemResult<T> =
  | { kind: 'found'; item: T }
  | { kind: 'not_found' }
  | { kind: 'invalid' }

async function readItem<T>(
  dependencies: RepositoryDependencies,
  key: DynamoDbKey,
  schema: ZodType<T>,
): Promise<ReadItemResult<T>> {
  const output = await dependencies.client.send(
    new GetCommand({
      TableName: dependencies.tableName,
      Key: key,
      ConsistentRead: true,
    }),
  )
  if (output.Item === undefined) {
    return { kind: 'not_found' }
  }
  const parsed = schema.safeParse(output.Item)
  return parsed.success
    ? { kind: 'found', item: parsed.data }
    : { kind: 'invalid' }
}

export function readSessionItem(
  dependencies: RepositoryDependencies,
  sessionId: SessionId,
): Promise<ReadItemResult<SessionItem>> {
  return readItem(dependencies, sessionKey(sessionId), SessionItemSchema)
}

export function readSegmentItem(
  dependencies: RepositoryDependencies,
  sessionId: SessionId,
  sequence: Sequence,
): Promise<ReadItemResult<SegmentItem>> {
  return readItem(
    dependencies,
    segmentKey(sessionId, sequence),
    SegmentItemSchema,
  )
}
