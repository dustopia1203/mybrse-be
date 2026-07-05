import { describe, expect, it } from 'vitest'

import type {
  DraftTranslator,
  RefinementQueue,
  SubtitlePublisher,
} from '../../src/ports'
import { SEGMENT_ID, SESSION_ID } from '../fixtures/ids'

describe('draft pipeline ports', () => {
  it('accepts provider-neutral implementations', async () => {
    const translator: DraftTranslator = {
      async translate(input) {
        return { kind: 'translated', text: `${input.sourceText}:vi` }
      },
    }
    const queue: RefinementQueue = {
      async enqueue() {
        return { kind: 'enqueued' }
      },
    }
    const publisher: SubtitlePublisher = {
      async publishDraft() {
        return { kind: 'published' }
      },
      async publishError() {
        return { kind: 'published' }
      },
    }
    const reference = {
      sessionId: SESSION_ID,
      segmentId: SEGMENT_ID,
      sequence: 1,
      revision: 2,
    }

    await expect(
      translator.translate({
        sourceText: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    ).resolves.toEqual({ kind: 'translated', text: 'hello:vi' })
    await expect(queue.enqueue(reference)).resolves.toEqual({
      kind: 'enqueued',
    })
    await expect(
      publisher.publishDraft(
        {
          connectionId: 'connection-1',
          callbackEndpoint: 'https://api.example.com/dev',
        },
        { reference, text: 'xin chào', isFinal: false },
      ),
    ).resolves.toEqual({ kind: 'published' })
  })
})
