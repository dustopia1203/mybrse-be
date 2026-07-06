import { beforeEach, describe, expect, it } from 'vitest'

import { createProcessRefinement } from '../../../src/application/refinement'
import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
  type Segment,
} from '../../../src/domain'
import type {
  GetSegmentResult,
  GetSessionResult,
  SaveDraftResult,
} from '../../../src/ports'
import { FakeSessionStateRepository } from '../../fakes/fake-session-state-repository'
import { FakeSubtitlePublisher } from '../../fakes/fake-subtitle-publisher'
import { FakeTranslationRefiner } from '../../fakes/fake-translation-refiner'
import {
  OTHER_SEGMENT_ID,
  SEGMENT_ID,
  SESSION_ID,
} from '../../fixtures/ids'

const callLog: string[] = []
const reference = {
  sessionId: SESSION_ID,
  segmentId: SEGMENT_ID,
  sequence: 10,
  revision: 4,
} as const
const connection = {
  connectionId: 'connection-1',
  callbackEndpoint: 'https://api.example.com/dev',
}
const session = {
  sessionId: SESSION_ID,
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  createdAtMs: 1_750_000_000_123,
  expiresAt: 1_750_086_400,
}
const segment = (overrides: Partial<Segment> = {}): Segment => ({
  ...reference,
  sourceText: 'こんにちは',
  isFinal: true,
  startMs: 1_200,
  endMs: 2_400,
  draftText: 'Xin chào',
  refinementStatus: 'QUEUED',
  ...overrides,
})
const error = (
  code:
    | 'PERSISTENCE_UNAVAILABLE'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_REJECTED'
    | 'PUBLISH_UNAVAILABLE'
    | 'CONNECTION_GONE',
): ApplicationError => ({
  code,
  message: code,
  retryable: APPLICATION_ERROR_RETRYABILITY[code],
})
const unusedDraftResult: SaveDraftResult = {
  kind: 'failed',
  error: error('PERSISTENCE_UNAVAILABLE'),
}

const createHarness = (
  sessionResult: GetSessionResult = {
    kind: 'found',
    value: { session, connection },
  },
  segmentResult: GetSegmentResult = {
    kind: 'found',
    segment: segment(),
  },
) => {
  const repository = new FakeSessionStateRepository(
    callLog,
    sessionResult,
    { kind: 'accepted', revision: 4 },
    unusedDraftResult,
  )
  repository.getSegmentResult = segmentResult
  repository.getContextResult = { kind: 'loaded', context: [] }
  repository.saveRefinedResult = {
    kind: 'stored',
    segment: segment({
      refinedText: 'Xin chào.',
      refinementStatus: 'COMPLETED',
    }),
  }
  const refiner = new FakeTranslationRefiner(callLog)
  const publisher = new FakeSubtitlePublisher(callLog)
  return {
    repository,
    refiner,
    publisher,
    processRefinement: createProcessRefinement({
      repository,
      refiner,
      publisher,
      contextLimit: 5,
    }),
  }
}

beforeEach(() => {
  callLog.length = 0
})

describe('ProcessRefinement', () => {
  it.each([
    [{ kind: 'not_found' as const }, 'not_found'],
    [
      { kind: 'found' as const, value: { session } },
      'connection_gone',
    ],
  ])('acknowledges terminal session state %#', async (result, reason) => {
    await expect(
      createHarness(result).processRefinement(reference),
    ).resolves.toEqual({ kind: 'acknowledged', reason, reference })
    expect(callLog).toEqual(['getSession'])
  })

  it.each([
    [{ kind: 'not_found' as const }, 'not_found'],
    [
      {
        kind: 'found' as const,
        segment: segment({ revision: 5 }),
      },
      'stale',
    ],
    [
      {
        kind: 'found' as const,
        segment: segment({ segmentId: OTHER_SEGMENT_ID }),
      },
      'stale',
    ],
  ])('acknowledges non-current segments %#', async (result, reason) => {
    await expect(
      createHarness(undefined, result).processRefinement(reference),
    ).resolves.toEqual({ kind: 'acknowledged', reason, reference })
    expect(callLog).toEqual(['getSession', 'getSegment'])
  })

  it('loads context, refines, saves, and publishes a current final in order', async () => {
    const harness = createHarness()
    harness.repository.getSegmentResult = {
      kind: 'found',
      segment: segment({ refinementStatus: 'PENDING' }),
    }
    const context = [
      {
        segmentId: OTHER_SEGMENT_ID,
        sequence: 9,
        sourceText: '前',
        translatedText: 'Trước',
        translationKind: 'refined' as const,
      },
    ]
    harness.repository.getContextResult = {
      kind: 'loaded',
      context,
    }

    await expect(harness.processRefinement(reference)).resolves.toEqual({
      kind: 'completed',
      reference,
    })
    expect(callLog).toEqual([
      'getSession',
      'getSegment',
      'getContext',
      'refine',
      'saveRefined',
      'publishRefined',
    ])
    expect(harness.repository.contextInputs).toEqual([
      { sessionId: SESSION_ID, beforeSequence: 10, limit: 5 },
    ])
    expect(harness.refiner.inputs).toEqual([
      {
        sourceText: 'こんにちは',
        draftText: 'Xin chào',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        context,
      },
    ])
    expect(harness.repository.refinedInputs).toEqual([
      { reference, refinedText: 'Xin chào.' },
    ])
    expect(harness.publisher.refined).toEqual([
      {
        connection,
        publication: { reference, text: 'Xin chào.' },
      },
    ])
  })

  it('passes empty context to the refiner for the first segment', async () => {
    const harness = createHarness()

    await expect(harness.processRefinement(reference)).resolves.toMatchObject({
      kind: 'completed',
    })
    expect(harness.refiner.inputs[0]?.context).toEqual([])
  })

  it('republishes an initially completed canonical result without provider work', async () => {
    const harness = createHarness(undefined, {
      kind: 'found',
      segment: segment({
        refinedText: 'Xin chào.',
        refinementStatus: 'COMPLETED',
      }),
    })

    await expect(harness.processRefinement(reference)).resolves.toEqual({
      kind: 'acknowledged',
      reason: 'already_completed',
      reference,
    })
    expect(callLog).toEqual([
      'getSession',
      'getSegment',
      'publishRefined',
    ])
    expect(harness.publisher.refined[0]?.publication.text).toBe('Xin chào.')
  })

  it('acknowledges the concurrent losing writer without publishing', async () => {
    const harness = createHarness()
    harness.repository.saveRefinedResult = {
      kind: 'already_completed',
      segment: segment({
        refinedText: 'Canonical winner.',
        refinementStatus: 'COMPLETED',
      }),
    }

    await expect(harness.processRefinement(reference)).resolves.toEqual({
      kind: 'acknowledged',
      reason: 'already_completed',
      reference,
    })
    expect(callLog).toEqual([
      'getSession',
      'getSegment',
      'getContext',
      'refine',
      'saveRefined',
    ])
    expect(harness.publisher.refined).toEqual([])
  })

  it('acknowledges a result superseded during refinement', async () => {
    const harness = createHarness()
    harness.repository.saveRefinedResult = {
      kind: 'not_current',
      attemptedRevision: 4,
      currentRevision: 5,
    }

    await expect(harness.processRefinement(reference)).resolves.toEqual({
      kind: 'acknowledged',
      reason: 'stale',
      reference,
    })
    expect(harness.publisher.refined).toEqual([])
  })

  it('retries canonical publication after the stored result is completed', async () => {
    const harness = createHarness(undefined, {
      kind: 'found',
      segment: segment({
        refinedText: 'Xin chào.',
        refinementStatus: 'COMPLETED',
      }),
    })
    harness.publisher.refinedResult = {
      kind: 'failed',
      error: error('PUBLISH_UNAVAILABLE'),
    }

    await expect(harness.processRefinement(reference)).resolves.toMatchObject({
      kind: 'failed',
      disposition: 'retry',
    })

    harness.publisher.refinedResult = { kind: 'published' }
    await expect(harness.processRefinement(reference)).resolves.toEqual({
      kind: 'acknowledged',
      reason: 'already_completed',
      reference,
    })
    expect(harness.refiner.inputs).toEqual([])
  })
})
