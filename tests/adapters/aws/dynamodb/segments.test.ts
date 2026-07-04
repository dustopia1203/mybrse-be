import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it } from 'vitest'

import { createTranscriptOperations } from '../../../../src/adapters/aws/dynamodb/segments'
import { sessionItem } from '../../../../src/adapters/aws/dynamodb/items'
import { OTHER_SEGMENT_ID, SEGMENT_ID, SESSION_ID } from '../../../fixtures/ids'
import { awsError, scriptedClient } from './scripted-client'

const session = {
  sessionId: SESSION_ID,
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  createdAtMs: 1_750_000_000_000,
  expiresAt: 1_750_086_400,
}
const revision = {
  sessionId: SESSION_ID,
  segmentId: SEGMENT_ID,
  sequence: 10,
  revision: 4,
  sourceText: 'こんにちは',
  isFinal: true,
  startMs: 1_200,
  endMs: 2_400,
}
const stored = {
  PK: `SESSION#${SESSION_ID}`,
  SK: 'SEGMENT#0000000010',
  entityType: 'SEGMENT',
  ...revision,
  expiresAt: session.expiresAt,
}

function operations(...responses: unknown[]) {
  const script = scriptedClient(...responses)
  return {
    script,
    repository: createTranscriptOperations({
      client: script.client,
      tableName: 'state',
    }),
  }
}

describe('DynamoDB transcript revisions', () => {
  it('accepts a newer revision and clears translation fields', async () => {
    const { script, repository } = operations(
      { Item: sessionItem(session) },
      {},
    )
    await expect(
      repository.acceptTranscriptRevision(revision),
    ).resolves.toEqual({ kind: 'accepted', revision: 4 })
    const command = script.commands[1] as UpdateCommand
    expect(command.input.UpdateExpression).toContain(
      'REMOVE #draftText, #refinedText, #refinementStatus',
    )
  })

  it('classifies an identical equal revision as duplicate', async () => {
    const pending = {
      ...stored,
      draftText: 'Xin chào',
      refinementStatus: 'PENDING',
    }
    const { repository } = operations(
      { Item: sessionItem(session) },
      awsError('ConditionalCheckFailedException'),
      { Item: pending },
    )
    await expect(
      repository.acceptTranscriptRevision(revision),
    ).resolves.toEqual({
      kind: 'duplicate',
      segment: {
        ...revision,
        draftText: 'Xin chào',
        refinementStatus: 'PENDING',
      },
    })
  })

  it('classifies an older revision as stale', async () => {
    const { repository } = operations(
      { Item: sessionItem(session) },
      awsError('ConditionalCheckFailedException'),
      { Item: { ...stored, revision: 5 } },
    )
    await expect(
      repository.acceptTranscriptRevision(revision),
    ).resolves.toEqual({
      kind: 'stale',
      submittedRevision: 4,
      currentRevision: 5,
    })
  })

  it('rejects conflicting payload or segment identity', async () => {
    const payloadConflict = operations(
      { Item: sessionItem(session) },
      awsError('ConditionalCheckFailedException'),
      { Item: { ...stored, sourceText: 'こんばんは' } },
    )
    await expect(
      payloadConflict.repository.acceptTranscriptRevision(revision),
    ).resolves.toMatchObject({
      kind: 'rejected',
      error: { code: 'SEGMENT_CONFLICT' },
    })

    const identityConflict = operations(
      { Item: sessionItem(session) },
      awsError('ConditionalCheckFailedException'),
      { Item: { ...stored, segmentId: OTHER_SEGMENT_ID } },
    )
    await expect(
      identityConflict.repository.acceptTranscriptRevision(revision),
    ).resolves.toMatchObject({
      kind: 'rejected',
      error: { code: 'SEGMENT_CONFLICT' },
    })
  })

  it('returns session not found before attempting a write', async () => {
    const { script, repository } = operations({ Item: undefined })
    await expect(
      repository.acceptTranscriptRevision(revision),
    ).resolves.toMatchObject({
      kind: 'rejected',
      error: { code: 'SESSION_NOT_FOUND' },
    })
    expect(script.commands).toHaveLength(1)
    expect(script.commands[0]).toBeInstanceOf(GetCommand)
  })

  it('rejects a sequence outside the ten-digit key range', async () => {
    const { script, repository } = operations()
    await expect(
      repository.acceptTranscriptRevision({
        ...revision,
        sequence: 10_000_000_000,
      }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      error: { code: 'INVALID_INPUT' },
    })
    expect(script.commands).toHaveLength(0)
  })
})
