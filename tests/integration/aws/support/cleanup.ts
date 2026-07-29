import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import type {
  BatchWriteCommandInput,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb'

import {
  RefinementJobSchema,
  type RefinementJob,
} from '../../../../src/contracts'

import type { TestRunRegistry } from './test-run'

const UNOWNED_DYNAMO_KEY_MESSAGE = 'Refusing to delete an unowned DynamoDB key'
const DYNAMO_CLEANUP_FAILURE_MESSAGE = 'Unable to clean up owned DynamoDB items'

type DynamoKey = { PK: string; SK: string }
type DeleteWriteRequest = NonNullable<
  NonNullable<BatchWriteCommandInput['RequestItems']>[string]
>[number]

export function assertOwnedDynamoKey(
  registry: TestRunRegistry,
  key: { PK: unknown; SK: unknown },
): void {
  if (
    typeof key?.PK !== 'string' ||
    typeof key?.SK !== 'string' ||
    key.SK.length === 0
  ) {
    throw new Error(UNOWNED_DYNAMO_KEY_MESSAGE)
  }

  const sessionId = key.PK.startsWith('SESSION#')
    ? key.PK.slice('SESSION#'.length)
    : undefined
  const connectionId = key.PK.startsWith('CONNECTION#')
    ? key.PK.slice('CONNECTION#'.length)
    : undefined

  if (
    (sessionId !== undefined && registry.sessionIds.has(sessionId)) ||
    (connectionId !== undefined && registry.connectionIds.has(connectionId))
  ) {
    return
  }

  throw new Error(UNOWNED_DYNAMO_KEY_MESSAGE)
}

function itemKey(item: Record<string, unknown>): DynamoKey {
  return { PK: item.PK as string, SK: item.SK as string }
}

function deleteRequestsForKeys(
  keys: readonly DynamoKey[],
): DeleteWriteRequest[] {
  return keys.map((key) => ({ DeleteRequest: { Key: key } }))
}

function assertOwnedDeleteRequests(
  registry: TestRunRegistry,
  requests: readonly DeleteWriteRequest[],
): void {
  for (const request of requests) {
    if (request.DeleteRequest?.Key === undefined) {
      throw new Error(DYNAMO_CLEANUP_FAILURE_MESSAGE)
    }
    assertOwnedDynamoKey(registry, {
      PK: request.DeleteRequest.Key.PK,
      SK: request.DeleteRequest.Key.SK,
    })
  }
}

async function deleteBatch(input: {
  client: DynamoDBDocumentClient
  tableName: string
  registry: TestRunRegistry
  keys: readonly DynamoKey[]
}): Promise<void> {
  let requests: DeleteWriteRequest[] = deleteRequestsForKeys(input.keys)

  for (let send = 0; send < 3; send += 1) {
    assertOwnedDeleteRequests(input.registry, requests)
    const output = await input.client.send(
      new BatchWriteCommand({
        RequestItems: { [input.tableName]: requests },
      }),
    )
    requests = output.UnprocessedItems?.[input.tableName] ?? []
    if (requests.length === 0) return
  }

  throw new Error(DYNAMO_CLEANUP_FAILURE_MESSAGE)
}

export async function cleanupOwnedDynamoDbItems(input: {
  client: DynamoDBDocumentClient
  tableName: string
  registry: TestRunRegistry
}): Promise<void> {
  try {
    const keys: DynamoKey[] = []

    for (const sessionId of input.registry.sessionIds) {
      let exclusiveStartKey: DynamoKey | undefined
      do {
        const output = await input.client.send(
          new QueryCommand({
            TableName: input.tableName,
            KeyConditionExpression: '#PK = :pk',
            ExpressionAttributeNames: { '#PK': 'PK' },
            ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
            ProjectionExpression: 'PK, SK',
            ...(exclusiveStartKey === undefined
              ? {}
              : { ExclusiveStartKey: exclusiveStartKey }),
          }),
        )
        keys.push(...(output.Items ?? []).map(itemKey))
        exclusiveStartKey = output.LastEvaluatedKey as DynamoKey | undefined
      } while (exclusiveStartKey !== undefined)
    }

    keys.push(
      ...[...input.registry.connectionIds].map((connectionId) => ({
        PK: `CONNECTION#${connectionId}`,
        SK: 'META',
      })),
    )

    for (const key of keys) assertOwnedDynamoKey(input.registry, key)

    for (let offset = 0; offset < keys.length; offset += 25) {
      await deleteBatch({
        ...input,
        keys: keys.slice(offset, offset + 25),
      })
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === UNOWNED_DYNAMO_KEY_MESSAGE ||
        error.message === DYNAMO_CLEANUP_FAILURE_MESSAGE)
    ) {
      throw error
    }
    throw new Error(DYNAMO_CLEANUP_FAILURE_MESSAGE)
  }
}

export function ownedQueueJob(
  registry: TestRunRegistry,
  body: string | undefined,
): RefinementJob | undefined {
  try {
    const parsedJob = RefinementJobSchema.safeParse(JSON.parse(body ?? ''))
    if (!parsedJob.success) return undefined

    const expectedJob = registry.expectedQueueJobs.get(parsedJob.data.sessionId)
    if (
      expectedJob === undefined ||
      expectedJob.sessionId !== parsedJob.data.sessionId ||
      expectedJob.segmentId !== parsedJob.data.segmentId ||
      expectedJob.sequence !== parsedJob.data.sequence ||
      expectedJob.revision !== parsedJob.data.revision
    ) {
      return undefined
    }

    return parsedJob.data
  } catch {
    return undefined
  }
}
