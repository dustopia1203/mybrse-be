import { describe, expect, it } from 'vitest'

import {
  SessionStartCommandSchema,
  TranscriptUpsertCommandSchema,
  WebSocketCommandSchema,
} from '../../src/contracts'
import { readJsonFixture } from '../fixtures/read-json-fixture'

const sessionStartCommand = readJsonFixture('session-start-command.json')
const transcriptUpsertCommand = readJsonFixture(
  'transcript-upsert-command.json',
)

describe('SessionStartCommandSchema', () => {
  it('parses the session start fixture through the specific and union schemas', () => {
    expect(SessionStartCommandSchema.parse(sessionStartCommand)).toEqual(
      sessionStartCommand,
    )
    expect(WebSocketCommandSchema.parse(sessionStartCommand)).toEqual(
      sessionStartCommand,
    )
  })

  it('rejects a missing target language', () => {
    const { targetLanguage: _targetLanguage, ...command } =
      sessionStartCommand as Record<string, unknown>

    expect(SessionStartCommandSchema.safeParse(command).success).toBe(false)
  })

  it.each(['audio', 'transcriptResultId', 'confidence'])(
    'rejects the extra field %s',
    (field) => {
      const result = SessionStartCommandSchema.safeParse({
        ...(sessionStartCommand as Record<string, unknown>),
        [field]: 'unexpected',
      })

      expect(result.success).toBe(false)
    },
  )
})

describe('TranscriptUpsertCommandSchema', () => {
  it('parses the transcript upsert fixture through the specific and union schemas', () => {
    expect(
      TranscriptUpsertCommandSchema.parse(transcriptUpsertCommand),
    ).toEqual(transcriptUpsertCommand)
    expect(WebSocketCommandSchema.parse(transcriptUpsertCommand)).toEqual(
      transcriptUpsertCommand,
    )
  })

  it('accepts empty text', () => {
    const result = TranscriptUpsertCommandSchema.safeParse({
      ...(transcriptUpsertCommand as Record<string, unknown>),
      text: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects endMs before startMs at the endMs path', () => {
    const result = TranscriptUpsertCommandSchema.safeParse({
      ...(transcriptUpsertCommand as Record<string, unknown>),
      startMs: 2400,
      endMs: 1200,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: 'endMs must be greater than or equal to startMs',
            path: ['endMs'],
          }),
        ]),
      )
    }
  })

  it.each(['audio', 'transcriptResultId', 'confidence'])(
    'rejects the extra field %s',
    (field) => {
      const result = TranscriptUpsertCommandSchema.safeParse({
        ...(transcriptUpsertCommand as Record<string, unknown>),
        [field]: 'unexpected',
      })

      expect(result.success).toBe(false)
    },
  )

  it('rejects a string revision', () => {
    const result = TranscriptUpsertCommandSchema.safeParse({
      ...(transcriptUpsertCommand as Record<string, unknown>),
      revision: '3',
    })

    expect(result.success).toBe(false)
  })
})
