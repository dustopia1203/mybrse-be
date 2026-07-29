import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs'
import { describe, expect, it } from 'vitest'

import {
  assertOwnedDynamoKey,
  cleanupOwnedDynamoDbItems,
  ownedQueueJob,
  removeExpectedQueueJob,
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

class ScriptedSqsClient {
  readonly commands: Array<
    | ReceiveMessageCommand
    | DeleteMessageCommand
    | ChangeMessageVisibilityCommand
  > = []

  constructor(private readonly responses: unknown[]) {}

  async send(
    command:
      | ReceiveMessageCommand
      | DeleteMessageCommand
      | ChangeMessageVisibilityCommand,
  ): Promise<unknown> {
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

  it('deletes an exact registered queue job by receipt handle and marks its session removed', async () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 1,
      revision: 1,
    }
    registerExpectedQueueJob(registry, job)
    const client = new ScriptedSqsClient([
      { Messages: [{ Body: JSON.stringify(job), ReceiptHandle: 'receipt-1' }] },
      {},
    ])

    await expect(
      removeExpectedQueueJob({
        client: client as never,
        queueUrl: 'https://example.com/queue',
        registry,
        sessionId: job.sessionId,
      }),
    ).resolves.toBe(true)

    expect(client.commands.map((command) => command.input)).toEqual([
      {
        QueueUrl: 'https://example.com/queue',
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
        VisibilityTimeout: 5,
      },
      { QueueUrl: 'https://example.com/queue', ReceiptHandle: 'receipt-1' },
    ])
    expect(registry.removedQueueSessionIds).toEqual(new Set([job.sessionId]))
  })

  it('restores foreign, mismatched, and malformed queue messages without deleting them', async () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 1,
      revision: 1,
    }
    registerExpectedQueueJob(registry, job)
    const foreignJob = {
      ...job,
      sessionId: registerSessionId(registry),
    }
    const client = new ScriptedSqsClient([
      {
        Messages: [
          { Body: JSON.stringify(foreignJob), ReceiptHandle: 'foreign' },
          {
            Body: JSON.stringify({ ...job, revision: 2 }),
            ReceiptHandle: 'mismatched',
          },
          { Body: '{malformed', ReceiptHandle: 'malformed' },
        ],
      },
    ])

    await expect(
      removeExpectedQueueJob({
        client: client as never,
        queueUrl: 'https://example.com/queue',
        registry,
        sessionId: job.sessionId,
        maxReceives: 1,
      }),
    ).resolves.toBe(false)

    const visibilityCommands = client.commands.filter(
      (command): command is ChangeMessageVisibilityCommand =>
        command instanceof ChangeMessageVisibilityCommand,
    )
    expect(visibilityCommands.map((command) => command.input)).toEqual([
      {
        QueueUrl: 'https://example.com/queue',
        ReceiptHandle: 'foreign',
        VisibilityTimeout: 0,
      },
      {
        QueueUrl: 'https://example.com/queue',
        ReceiptHandle: 'mismatched',
        VisibilityTimeout: 0,
      },
      {
        QueueUrl: 'https://example.com/queue',
        ReceiptHandle: 'malformed',
        VisibilityTimeout: 0,
      },
    ])
    expect(
      client.commands.some(
        (command) => command instanceof DeleteMessageCommand,
      ),
    ).toBe(false)
  })

  it('never deletes a queue message without a body or receipt handle', async () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 1,
      revision: 1,
    }
    registerExpectedQueueJob(registry, job)
    const client = new ScriptedSqsClient([
      {
        Messages: [
          { ReceiptHandle: 'missing-body' },
          { Body: JSON.stringify(job) },
        ],
      },
    ])

    await expect(
      removeExpectedQueueJob({
        client: client as never,
        queueUrl: 'https://example.com/queue',
        registry,
        sessionId: job.sessionId,
        maxReceives: 1,
      }),
    ).resolves.toBe(false)

    expect(client.commands.map((command) => command.input)).toEqual([
      {
        QueueUrl: 'https://example.com/queue',
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
        VisibilityTimeout: 5,
      },
      {
        QueueUrl: 'https://example.com/queue',
        ReceiptHandle: 'missing-body',
        VisibilityTimeout: 0,
      },
    ])
    expect(
      client.commands.some(
        (command) => command instanceof DeleteMessageCommand,
      ),
    ).toBe(false)
  })

  it('stops after exactly the configured maximum receive calls', async () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const client = new ScriptedSqsClient([{}, {}, {}])

    await expect(
      removeExpectedQueueJob({
        client: client as never,
        queueUrl: 'https://example.com/queue',
        registry,
        sessionId,
        maxReceives: 2,
      }),
    ).resolves.toBe(false)

    expect(
      client.commands.filter(
        (command) => command instanceof ReceiveMessageCommand,
      ),
    ).toHaveLength(2)
  })

  it('wraps SQS errors without leaking raw message bodies', async () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const body = '{"sensitive":"queue body"}'
    const client = new ScriptedSqsClient([new Error(body)])

    await expect(
      removeExpectedQueueJob({
        client: client as never,
        queueUrl: 'https://example.com/queue',
        registry,
        sessionId,
      }),
    ).rejects.toThrow('Unable to inspect the integration test queue')
  })
})
