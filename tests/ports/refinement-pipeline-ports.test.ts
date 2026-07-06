import { describe, expect, it } from 'vitest'

import type { SubtitlePublisher, TranslationRefiner } from '../../src/ports'
import { SEGMENT_ID, SESSION_ID } from '../fixtures/ids'

describe('refinement pipeline ports', () => {
  it('accepts provider-neutral implementations', async () => {
    const refiner: TranslationRefiner = {
      async refine(input) {
        return {
          kind: 'refined',
          text: `${input.draftText}.`,
        }
      },
    }
    const publisher: SubtitlePublisher = {
      async publishDraft() {
        return { kind: 'published' }
      },
      async publishError() {
        return { kind: 'published' }
      },
      async publishRefined() {
        return { kind: 'published' }
      },
    }
    const reference = {
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      sequence: 10,
      revision: 4,
    }
    const connection = {
      connectionId: 'connection-1',
      callbackEndpoint: 'https://api.example.com/dev',
    }

    await expect(
      refiner.refine({
        sourceText: 'こんにちは',
        draftText: 'Xin chào',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        context: [],
      }),
    ).resolves.toEqual({ kind: 'refined', text: 'Xin chào.' })
    await expect(
      publisher.publishRefined(connection, {
        reference,
        text: 'Xin chào.',
      }),
    ).resolves.toEqual({ kind: 'published' })
  })
})
