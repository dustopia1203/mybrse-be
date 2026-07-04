import { describe, expect, it } from 'vitest'

import {
  ConnectionItemSchema,
  SegmentItemSchema,
  SessionItemSchema,
  connectionItem,
  segmentFromItem,
  sessionFromItem,
  sessionItem,
} from '../../../../src/adapters/aws/dynamodb/items'
import { SEGMENT_ID, SESSION_ID } from '../../../fixtures/ids'

const session = {
  sessionId: SESSION_ID,
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  createdAtMs: 1_750_000_000_000,
  expiresAt: 1_750_086_400,
}

describe('DynamoDB item codecs', () => {
  it('round-trips a connected session', () => {
    const item = sessionItem(session, {
      connectionId: 'connection-1',
      callbackEndpoint: 'https://api.example.com/dev',
    })
    expect(SessionItemSchema.parse(item)).toEqual(item)
    expect(sessionFromItem(item)).toEqual({
      session,
      connection: {
        connectionId: 'connection-1',
        callbackEndpoint: 'https://api.example.com/dev',
      },
    })
  })

  it('rejects half-present connection metadata', () => {
    expect(() =>
      SessionItemSchema.parse({
        ...sessionItem(session),
        connectionId: 'connection-1',
      }),
    ).toThrow('connectionId and callbackEndpoint must appear together')
  })

  it('parses a segment and removes persistence attributes', () => {
    const item = SegmentItemSchema.parse({
      PK: `SESSION#${SESSION_ID}`,
      SK: 'SEGMENT#0000000010',
      entityType: 'SEGMENT',
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      sequence: 10,
      revision: 3,
      sourceText: 'こんにちは',
      isFinal: true,
      startMs: 1_200,
      endMs: 2_400,
      draftText: 'Xin chào',
      refinementStatus: 'PENDING',
      expiresAt: session.expiresAt,
    })
    expect(segmentFromItem(item)).toEqual({
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      sequence: 10,
      revision: 3,
      sourceText: 'こんにちは',
      isFinal: true,
      startMs: 1_200,
      endMs: 2_400,
      draftText: 'Xin chào',
      refinementStatus: 'PENDING',
    })
  })

  it('creates and strictly parses a connection lookup', () => {
    const item = connectionItem('connection-1', SESSION_ID, session.expiresAt)
    expect(ConnectionItemSchema.parse(item)).toEqual(item)
    expect(() =>
      ConnectionItemSchema.parse({ ...item, transcriptText: 'secret' }),
    ).toThrow()
  })
})
