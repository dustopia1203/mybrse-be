import { describe, expect, it } from 'vitest'

import {
  SessionStartedEventSchema,
  SubtitleDraftEventSchema,
  SubtitleRefinedEventSchema,
  TranslationErrorEventSchema,
  WebSocketOutboundEventSchema,
} from '../../src/contracts'
import {
  APPLICATION_ERROR_RETRYABILITY,
  ApplicationErrorCodeSchema,
} from '../../src/domain'
import { SEGMENT_ID, SESSION_ID } from '../fixtures/ids'
import { readJsonFixture } from '../fixtures/read-json-fixture'

const sessionStartedEvent = readJsonFixture('session-started-event.json')
const subtitleDraftEvent = readJsonFixture('subtitle-draft-event.json')
const subtitleRefinedEvent = readJsonFixture('subtitle-refined-event.json')
const translationErrorContractEvent = readJsonFixture(
  'translation-error-contract-event.json',
)
const translationErrorDraftEvent = readJsonFixture(
  'translation-error-draft-event.json',
)

describe.each([
  ['session started', SessionStartedEventSchema, sessionStartedEvent],
  ['subtitle draft', SubtitleDraftEventSchema, subtitleDraftEvent],
  ['subtitle refined', SubtitleRefinedEventSchema, subtitleRefinedEvent],
  [
    'contract translation error',
    TranslationErrorEventSchema,
    translationErrorContractEvent,
  ],
  [
    'draft translation error',
    TranslationErrorEventSchema,
    translationErrorDraftEvent,
  ],
])('%s fixture', (_name, schema, fixture) => {
  it('parses through the specific and outbound union schemas', () => {
    expect(schema.parse(fixture)).toEqual(fixture)
    expect(WebSocketOutboundEventSchema.parse(fixture)).toEqual(fixture)
  })
})

describe('SubtitleRefinedEventSchema', () => {
  it('requires isFinal to be true', () => {
    expect(
      SubtitleRefinedEventSchema.safeParse({
        ...(subtitleRefinedEvent as Record<string, unknown>),
        isFinal: false,
      }).success,
    ).toBe(false)
  })
})

describe('TranslationErrorEventSchema', () => {
  it.each(ApplicationErrorCodeSchema.options)(
    'requires retryability to match %s',
    (code) => {
      const result = TranslationErrorEventSchema.safeParse({
        ...(translationErrorContractEvent as Record<string, unknown>),
        code,
        retryable: !APPLICATION_ERROR_RETRYABILITY[code],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: 'retryable must match the application error code',
              path: ['retryable'],
            }),
          ]),
        )
      }
    },
  )

  it.each(['sessionId', 'segmentId', 'revision'])(
    'rejects correlation field %s for contract errors',
    (field) => {
      expect(
        TranslationErrorEventSchema.safeParse({
          ...(translationErrorContractEvent as Record<string, unknown>),
          [field]: field === 'revision' ? 1 : 'unexpected',
        }).success,
      ).toBe(false)
    },
  )

  it('requires sessionId for session errors', () => {
    expect(
      TranslationErrorEventSchema.safeParse({
        type: 'translation.error',
        stage: 'session',
        code: 'SESSION_NOT_FOUND',
        retryable: false,
      }).success,
    ).toBe(false)
  })

  it.each(['draft', 'refinement_queue', 'refinement'] as const)(
    'requires all correlation fields for %s errors',
    (stage) => {
      const complete = {
        type: 'translation.error',
        stage,
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
        sessionId: SESSION_ID,
        segmentId: SEGMENT_ID,
        revision: 4,
      }

      for (const field of ['sessionId', 'segmentId', 'revision'] as const) {
        const { [field]: _omitted, ...incomplete } = complete
        expect(TranslationErrorEventSchema.safeParse(incomplete).success).toBe(
          false,
        )
      }
    },
  )

  it.each(['message', 'transcriptText'])(
    'rejects the extra field %s',
    (field) => {
      expect(
        TranslationErrorEventSchema.safeParse({
          ...(translationErrorDraftEvent as Record<string, unknown>),
          [field]: 'unexpected',
        }).success,
      ).toBe(false)
    },
  )
})
