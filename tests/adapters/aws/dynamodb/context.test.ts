import { QueryCommand } from '@aws-sdk/lib-dynamodb'
import { describe, expect, it } from 'vitest'

import { createContextOperations } from '../../../../src/adapters/aws/dynamodb/context'
import { SEGMENT_ID, SESSION_ID } from '../../../fixtures/ids'
import { scriptedClient } from './scripted-client'

function item(sequence: number, fields: Record<string, unknown> = {}) {
  return {
    PK: `SESSION#${SESSION_ID}`,
    SK: `SEGMENT#${sequence.toString().padStart(10, '0')}`,
    entityType: 'SEGMENT',
    sessionId: SESSION_ID,
    segmentId: SEGMENT_ID,
    sequence,
    revision: 1,
    sourceText: `source-${sequence}`,
    isFinal: true,
    startMs: sequence * 100,
    endMs: sequence * 100 + 50,
    draftText: `draft-${sequence}`,
    refinementStatus: 'QUEUED',
    expiresAt: 1_750_086_400,
    ...fields,
  }
}

describe('DynamoDB translation context', () => {
  it('returns empty context before sequence zero without querying', async () => {
    const script = scriptedClient()
    const repository = createContextOperations({
      client: script.client,
      tableName: 'state',
    })
    await expect(
      repository.getPreviousFinalSegments({
        sessionId: SESSION_ID,
        beforeSequence: 0,
        limit: 5,
      }),
    ).resolves.toEqual({ kind: 'loaded', context: [] })
    expect(script.commands).toHaveLength(0)
  })

  it('paginates filtered pages and returns ascending refined-first context', async () => {
    const script = scriptedClient(
      {
        Items: [
          item(9, { refinedText: 'refined-9', refinementStatus: 'COMPLETED' }),
        ],
        LastEvaluatedKey: {
          PK: `SESSION#${SESSION_ID}`,
          SK: 'SEGMENT#0000000008',
        },
      },
      { Items: [item(7)] },
    )
    const repository = createContextOperations({
      client: script.client,
      tableName: 'state',
    })
    await expect(
      repository.getPreviousFinalSegments({
        sessionId: SESSION_ID,
        beforeSequence: 10,
        limit: 2,
      }),
    ).resolves.toEqual({
      kind: 'loaded',
      context: [
        {
          segmentId: SEGMENT_ID,
          sequence: 7,
          sourceText: 'source-7',
          translatedText: 'draft-7',
          translationKind: 'draft',
        },
        {
          segmentId: SEGMENT_ID,
          sequence: 9,
          sourceText: 'source-9',
          translatedText: 'refined-9',
          translationKind: 'refined',
        },
      ],
    })
    for (const command of script.commands) {
      expect(command).toBeInstanceOf(QueryCommand)
      expect((command as QueryCommand).input.ConsistentRead).toBe(true)
      expect((command as QueryCommand).input.ScanIndexForward).toBe(false)
    }
    expect(
      (script.commands[1] as QueryCommand).input.ExclusiveStartKey,
    ).toEqual({
      PK: `SESSION#${SESSION_ID}`,
      SK: 'SEGMENT#0000000008',
    })
  })

  it('rejects a non-positive limit without querying', async () => {
    const script = scriptedClient()
    const repository = createContextOperations({
      client: script.client,
      tableName: 'state',
    })
    await expect(
      repository.getPreviousFinalSegments({
        sessionId: SESSION_ID,
        beforeSequence: 10,
        limit: 0,
      }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      error: { code: 'INVALID_INPUT' },
    })
  })
})
