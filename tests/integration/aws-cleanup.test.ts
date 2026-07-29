import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it } from 'vitest'

import {
  assertOwnedDynamoKey,
  cleanupOwnedDynamoDbItems,
  ownedQueueJob,
} from './aws/support/cleanup'
import {
  createTestRunRegistry,
  registerConnectionId,
  registerExpectedQueueJob,
  registerSegmentId,
  registerSessionId,
} from './aws/support/test-run'

class ScriptedDynamoDbDocumentClient {
  readonly commands: Array<QueryCommand | BatchWriteCommand> = []

  constructor(private readonly responses: unknown[]) {}

  async send(command: QueryCommand | BatchWriteCommand): Promise<unknown> {
    this.commands.push(command)
    const response = this.responses.shift()
    if (response instanceof Error) throw response
    return response ?? {}
  }
}

describe('live AWS cleanup ownership guards', () => {
  it('accepts only registered session and connection keys', () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const connectionId = registerConnectionId(registry, 'cleanup')
    expect(() =>
      assertOwnedDynamoKey(registry, {
        PK: `SESSION#${sessionId}`,
        SK: 'SEGMENT#0000000001',
      }),
    ).not.toThrow()
    expect(() =>
      assertOwnedDynamoKey(registry, {
        PK: `CONNECTION#${connectionId}`,
        SK: 'META',
      }),
    ).not.toThrow()
    expect(() =>
      assertOwnedDynamoKey(registry, {
        PK: 'SESSION#0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
        SK: 'META',
      }),
    ).toThrow('Refusing to delete an unowned DynamoDB key')
  })

  it('rejects malformed DynamoDB key fields with the fixed error', () => {
    const registry = createTestRunRegistry()
    const invalidKeys: unknown[] = [
      { PK: undefined, SK: 'META' },
      { PK: `SESSION#${registerSessionId(registry)}`, SK: undefined },
      { PK: 42, SK: 'META' },
      { PK: `SESSION#${registerSessionId(registry)}`, SK: '' },
    ]

    for (const key of invalidKeys) {
      expect(() =>
        assertOwnedDynamoKey(registry, key as { PK: string; SK: string }),
      ).toThrow('Refusing to delete an unowned DynamoDB key')
    }
  })

  it('returns only the exact registered queue job', () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 3,
      revision: 2,
    }
    registerExpectedQueueJob(registry, job)
    expect(ownedQueueJob(registry, JSON.stringify(job))).toEqual(job)
    const alteredSessionId = registerSessionId(registry)
    const alteredSegmentId = registerSegmentId(registry)
    for (const mismatchedJob of [
      { ...job, sessionId: alteredSessionId },
      { ...job, segmentId: alteredSegmentId },
      { ...job, sequence: 4 },
      { ...job, revision: 3 },
    ]) {
      expect(
        ownedQueueJob(registry, JSON.stringify(mismatchedJob)),
      ).toBeUndefined()
    }
    expect(ownedQueueJob(registry, '{bad json')).toBeUndefined()
  })

  it('rejects a queue job when its mutable map entry has another session', () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 3,
      revision: 2,
    }
    registerExpectedQueueJob(registry, job)
    registry.expectedQueueJobs.set(job.sessionId, {
      ...job,
      sessionId: registerSessionId(registry),
    })

    expect(ownedQueueJob(registry, JSON.stringify(job))).toBeUndefined()
  })

  it('queries only owned session partitions and deletes their projected keys plus owned connections', async () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const connectionId = registerConnectionId(registry, 'cleanup')
    const client = new ScriptedDynamoDbDocumentClient([
      {
        Items: [{ PK: `SESSION#${sessionId}`, SK: 'META' }],
        LastEvaluatedKey: {
          PK: `SESSION#${sessionId}`,
          SK: 'SEGMENT#0000000001',
        },
      },
      {
        Items: [{ PK: `SESSION#${sessionId}`, SK: 'SEGMENT#0000000001' }],
      },
      {
        UnprocessedItems: {
          state: [
            {
              DeleteRequest: {
                Key: { PK: `CONNECTION#${connectionId}`, SK: 'META' },
              },
            },
          ],
        },
      },
      {},
    ])

    await cleanupOwnedDynamoDbItems({
      client: client as never,
      tableName: 'state',
      registry,
    })

    const queryCommands = client.commands.filter(
      (command): command is QueryCommand => command instanceof QueryCommand,
    )
    expect(queryCommands).toHaveLength(2)
    expect(queryCommands.map((command) => command.input)).toEqual([
      {
        TableName: 'state',
        KeyConditionExpression: '#PK = :pk',
        ExpressionAttributeNames: { '#PK': 'PK' },
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
        ProjectionExpression: 'PK, SK',
      },
      {
        TableName: 'state',
        KeyConditionExpression: '#PK = :pk',
        ExpressionAttributeNames: { '#PK': 'PK' },
        ExpressionAttributeValues: { ':pk': `SESSION#${sessionId}` },
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: {
          PK: `SESSION#${sessionId}`,
          SK: 'SEGMENT#0000000001',
        },
      },
    ])

    const batchCommands = client.commands.filter(
      (command): command is BatchWriteCommand =>
        command instanceof BatchWriteCommand,
    )
    expect(batchCommands.map((command) => command.input.RequestItems)).toEqual([
      {
        state: [
          {
            DeleteRequest: { Key: { PK: `SESSION#${sessionId}`, SK: 'META' } },
          },
          {
            DeleteRequest: {
              Key: {
                PK: `SESSION#${sessionId}`,
                SK: 'SEGMENT#0000000001',
              },
            },
          },
          {
            DeleteRequest: {
              Key: { PK: `CONNECTION#${connectionId}`, SK: 'META' },
            },
          },
        ],
      },
      {
        state: [
          {
            DeleteRequest: {
              Key: { PK: `CONNECTION#${connectionId}`, SK: 'META' },
            },
          },
        ],
      },
    ])
  })

  it('validates every queried key before issuing a batch delete', async () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const client = new ScriptedDynamoDbDocumentClient([
      {
        Items: [
          {
            PK: 'SESSION#0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
            SK: 'META',
          },
        ],
      },
    ])

    await expect(
      cleanupOwnedDynamoDbItems({
        client: client as never,
        tableName: 'state',
        registry,
      }),
    ).rejects.toThrow('Refusing to delete an unowned DynamoDB key')
    expect(client.commands).toHaveLength(1)
    expect(client.commands[0]).toBeInstanceOf(QueryCommand)
    expect(
      (client.commands[0] as QueryCommand).input.ExpressionAttributeValues,
    ).toEqual({ ':pk': `SESSION#${sessionId}` })
  })

  it('splits owned connection deletes into DynamoDB batches of at most 25', async () => {
    const registry = createTestRunRegistry()
    for (let index = 0; index < 26; index += 1) {
      registerConnectionId(registry, `batch-${index}`)
    }
    const client = new ScriptedDynamoDbDocumentClient([{}, {}])

    await cleanupOwnedDynamoDbItems({
      client: client as never,
      tableName: 'state',
      registry,
    })

    const batchCommands = client.commands.filter(
      (command): command is BatchWriteCommand =>
        command instanceof BatchWriteCommand,
    )
    expect(batchCommands).toHaveLength(2)
    expect(
      batchCommands.map((command) => command.input.RequestItems?.state?.length),
    ).toEqual([25, 1])
  })

  it('retries only unprocessed deletes for no more than three sends', async () => {
    const registry = createTestRunRegistry()
    const connectionId = registerConnectionId(registry, 'retry')
    const unprocessedItems = {
      state: [
        {
          DeleteRequest: {
            Key: { PK: `CONNECTION#${connectionId}`, SK: 'META' },
          },
        },
      ],
    }
    const client = new ScriptedDynamoDbDocumentClient([
      { UnprocessedItems: unprocessedItems },
      { UnprocessedItems: unprocessedItems },
      { UnprocessedItems: unprocessedItems },
    ])

    await expect(
      cleanupOwnedDynamoDbItems({
        client: client as never,
        tableName: 'state',
        registry,
      }),
    ).rejects.toThrow('Unable to clean up owned DynamoDB items')
    expect(client.commands).toHaveLength(3)
    expect(
      client.commands.every((command) => command instanceof BatchWriteCommand),
    ).toBe(true)
  })
})
