import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it } from 'vitest'

import { createLifecycleOperations } from '../../../../src/adapters/aws/dynamodb/lifecycle'
import { sessionItem } from '../../../../src/adapters/aws/dynamodb/items'
import { SESSION_ID } from '../../../fixtures/ids'
import { awsError, scriptedClient } from './scripted-client'

const session = {
  sessionId: SESSION_ID,
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  createdAtMs: 1_750_000_000_000,
  expiresAt: 1_750_086_400,
}
const firstConnection = {
  connectionId: 'connection-1',
  callbackEndpoint: 'https://api.example.com/dev',
}
const secondConnection = {
  connectionId: 'connection-2',
  callbackEndpoint: 'https://api.example.com/dev',
}

describe('DynamoDB session lifecycle', () => {
  it('creates session and reverse mapping atomically', async () => {
    const script = scriptedClient({ Item: undefined }, {})
    const repository = createLifecycleOperations({
      client: script.client,
      tableName: 'state',
    })

    await expect(
      repository.startOrReattach({ session, connection: firstConnection }),
    ).resolves.toEqual({ kind: 'created' })

    expect(script.commands[0]).toBeInstanceOf(GetCommand)
    expect((script.commands[0] as GetCommand).input.ConsistentRead).toBe(true)
    expect(script.commands[1]).toBeInstanceOf(TransactWriteCommand)
    expect(
      (script.commands[1] as TransactWriteCommand).input.TransactItems,
    ).toHaveLength(2)
    script.assertConsumed()
  })

  it('rejects a language conflict without a transaction', async () => {
    const script = scriptedClient({
      Item: sessionItem({ ...session, targetLanguage: 'en' }, firstConnection),
    })
    const repository = createLifecycleOperations({
      client: script.client,
      tableName: 'state',
    })

    await expect(
      repository.startOrReattach({ session, connection: secondConnection }),
    ).resolves.toEqual({ kind: 'language_conflict' })
    expect(script.commands).toHaveLength(1)
  })

  it('reattaches and deletes the previous reverse mapping atomically', async () => {
    const script = scriptedClient(
      { Item: sessionItem(session, firstConnection) },
      {},
    )
    const repository = createLifecycleOperations({
      client: script.client,
      tableName: 'state',
    })

    await expect(
      repository.startOrReattach({ session, connection: secondConnection }),
    ).resolves.toEqual({ kind: 'reattached' })
    expect(
      (script.commands[1] as TransactWriteCommand).input.TransactItems,
    ).toHaveLength(3)
  })

  it('returns superseded and deletes only a stale lookup', async () => {
    const script = scriptedClient(
      {
        Item: {
          PK: 'CONNECTION#connection-1',
          SK: 'META',
          entityType: 'CONNECTION',
          connectionId: 'connection-1',
          sessionId: SESSION_ID,
          expiresAt: session.expiresAt,
        },
      },
      awsError('TransactionCanceledException'),
      { Item: sessionItem(session, secondConnection) },
      {},
    )
    const repository = createLifecycleOperations({
      client: script.client,
      tableName: 'state',
    })

    await expect(
      repository.detachByConnectionId('connection-1'),
    ).resolves.toEqual({ kind: 'superseded' })
    expect(script.commands[0]).toBeInstanceOf(GetCommand)
    expect(script.commands[1]).toBeInstanceOf(TransactWriteCommand)
    expect(script.commands[2]).toBeInstanceOf(GetCommand)
  })

  it('normalizes an infrastructure failure', async () => {
    const script = scriptedClient(awsError('ThrottlingException'))
    const repository = createLifecycleOperations({
      client: script.client,
      tableName: 'state',
    })

    await expect(
      repository.startOrReattach({ session, connection: firstConnection }),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'PERSISTENCE_UNAVAILABLE', retryable: true },
    })
  })
})
