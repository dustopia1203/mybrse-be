import { describe, expect, it } from 'vitest'

import {
  toDraftEvent,
  toErrorEvent,
  toRefinedEvent,
} from '../../../../src/adapters/aws/apigateway/outbound-event-mapping'
import {
  DraftTranslationErrorEventSchema,
  RefinementQueueTranslationErrorEventSchema,
  SubtitleDraftEventSchema,
  SubtitleRefinedEventSchema,
} from '../../../../src/contracts'
import { SEGMENT_ID, SESSION_ID } from '../../../fixtures/ids'

const reference = {
  sessionId: SESSION_ID,
  segmentId: SEGMENT_ID,
  sequence: 10,
  revision: 4,
}

describe('outbound event mapping', () => {
  it('maps draft and refined publications', () => {
    expect(
      SubtitleDraftEventSchema.parse(
        toDraftEvent({ reference, text: 'Xin chào', isFinal: false }),
      ),
    ).toMatchObject({ type: 'subtitle.draft', sequence: 10, isFinal: false })
    expect(
      SubtitleRefinedEventSchema.parse(
        toRefinedEvent({ reference, text: 'Xin chào.' }),
      ),
    ).toMatchObject({ type: 'subtitle.refined', isFinal: true })
  })

  it.each([
    ['draft', DraftTranslationErrorEventSchema],
    ['refinement_queue', RefinementQueueTranslationErrorEventSchema],
  ] as const)(
    'maps %s errors without the internal message',
    (stage, schema) => {
      const event = toErrorEvent({
        stage,
        reference,
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          message: 'must not cross the boundary',
          retryable: true,
        },
      })
      expect(schema.parse(event)).toMatchObject({
        type: 'translation.error',
        stage,
        code: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      })
      expect(event).not.toHaveProperty('message')
      expect(event).not.toHaveProperty('sequence')
    },
  )
})
