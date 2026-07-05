import { beforeEach, describe, expect, it } from 'vitest'

import { createProcessTranscript } from '../../../src/application/draft'
import {
  APPLICATION_ERROR_RETRYABILITY,
  type ApplicationError,
  type Segment,
} from '../../../src/domain'
import { FakeDraftTranslator } from '../../fakes/fake-draft-translator'
import { FakeRefinementQueue } from '../../fakes/fake-refinement-queue'
import { FakeSessionStateRepository } from '../../fakes/fake-session-state-repository'
import { FakeSubtitlePublisher } from '../../fakes/fake-subtitle-publisher'
import { SEGMENT_ID, SESSION_ID } from '../../fixtures/ids'

const callLog: string[] = []
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
const partialInput = {
  sessionId: SESSION_ID,
  segmentId: SEGMENT_ID,
  sequence: 10,
  revision: 3,
  sourceText: 'こんにちは',
  isFinal: false,
  startMs: 1_200,
  endMs: 2_400,
} as const
const finalInput = { ...partialInput, revision: 4, isFinal: true } as const
const referenceOf = (input: typeof partialInput | typeof finalInput) => ({
  sessionId: input.sessionId,
  segmentId: input.segmentId,
  sequence: input.sequence,
  revision: input.revision,
})
const segmentOf = (
  input: typeof partialInput | typeof finalInput,
  overrides: Partial<Segment> = {},
): Segment => ({ ...input, ...overrides })
const foundSession = {
  kind: 'found' as const,
  value: { session, connection },
}
const error = (
  code:
    | 'PERSISTENCE_UNAVAILABLE'
    | 'PROVIDER_UNAVAILABLE'
    | 'QUEUE_UNAVAILABLE'
    | 'PUBLISH_UNAVAILABLE',
): ApplicationError => ({
  code,
  message: code,
  retryable: APPLICATION_ERROR_RETRYABILITY[code],
})
const persistenceError = error('PERSISTENCE_UNAVAILABLE')
const createHarness = (repository: FakeSessionStateRepository) => {
  const translator = new FakeDraftTranslator(callLog)
  const refinementQueue = new FakeRefinementQueue(callLog)
  const publisher = new FakeSubtitlePublisher(callLog)
  return {
    translator,
    refinementQueue,
    publisher,
    processTranscript: createProcessTranscript({
      repository,
      translator,
      refinementQueue,
      publisher,
    }),
  }
}

beforeEach(() => {
  callLog.length = 0
})

describe('ProcessTranscript', () => {
  it.each([
    [{ kind: 'not_found' as const }, 'SESSION_NOT_FOUND', ['getSession']],
    [
      { kind: 'found' as const, value: { session } },
      'CONNECTION_GONE',
      ['getSession'],
    ],
  ])('guards unavailable sessions %#', async (sessionResult, code, calls) => {
    const repository = new FakeSessionStateRepository(
      callLog,
      sessionResult,
      { kind: 'accepted', revision: 3 },
      { kind: 'failed', error: persistenceError },
    )
    const result =
      await createHarness(repository).processTranscript(partialInput)
    expect(result).toMatchObject({ kind: 'failed', error: { code } })
    expect(callLog).toEqual(calls)
  })

  it('acknowledges stale revisions', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'stale', submittedRevision: 2, currentRevision: 3 },
      { kind: 'failed', error: persistenceError },
    )
    await expect(
      createHarness(repository).processTranscript(partialInput),
    ).resolves.toEqual({
      kind: 'stale',
      submittedRevision: 2,
      currentRevision: 3,
    })
    expect(callLog).toEqual(['getSession', 'accept'])
  })

  it('translates, stores, and publishes a partial in order', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 3 },
      {
        kind: 'stored',
        segment: segmentOf(partialInput, { draftText: 'Xin chào' }),
      },
    )
    await expect(
      createHarness(repository).processTranscript(partialInput),
    ).resolves.toEqual({
      kind: 'published',
      reference: referenceOf(partialInput),
      isFinal: false,
    })
    expect(callLog).toEqual([
      'getSession',
      'accept',
      'translate',
      'saveDraft',
      'publishDraft',
    ])
  })

  it.each([
    [
      {
        kind: 'not_current' as const,
        attemptedRevision: 3,
        currentRevision: 4,
      },
      { kind: 'superseded', attemptedRevision: 3, currentRevision: 4 },
    ],
    [
      {
        kind: 'already_stored' as const,
        segment: segmentOf(partialInput, { draftText: 'Khác' }),
      },
      { kind: 'superseded', attemptedRevision: 3, currentRevision: 3 },
    ],
  ])('does not publish a superseded draft %#', async (saved, expected) => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 3 },
      saved,
    )
    await expect(
      createHarness(repository).processTranscript(partialInput),
    ).resolves.toEqual(expected)
    expect(callLog).not.toContain('publishDraft')
  })

  it.each([
    ['provider', error('PROVIDER_UNAVAILABLE')],
    ['persistence', persistenceError],
  ])('reports %s failures at the draft stage', async (source, failure) => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 3 },
      { kind: 'failed', error: persistenceError },
    )
    const harness = createHarness(repository)
    if (source === 'provider')
      harness.translator.result = { kind: 'failed', error: failure }
    await expect(harness.processTranscript(partialInput)).resolves.toEqual({
      kind: 'failed',
      error: failure,
    })
    expect(harness.publisher.errors[0]?.publication.stage).toBe('draft')
  })

  it('publishes, enqueues, and marks a final in order', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 4 },
      {
        kind: 'stored',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
    )
    await expect(
      createHarness(repository).processTranscript(finalInput),
    ).resolves.toEqual({ kind: 'queued', reference: referenceOf(finalInput) })
    expect(callLog).toEqual([
      'getSession',
      'accept',
      'translate',
      'saveDraft',
      'publishDraft',
      'enqueue',
      'markQueued',
    ])
  })

  it.each([
    [{ kind: 'already_queued' as const }, 'already_queued'],
    [{ kind: 'already_completed' as const }, 'already_completed'],
    [
      {
        kind: 'not_current' as const,
        attemptedRevision: 4,
        currentRevision: 5,
      },
      'superseded',
    ],
  ])('maps final queue state %#', async (markResult, kind) => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 4 },
      {
        kind: 'stored',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
      markResult,
    )
    await expect(
      createHarness(repository).processTranscript(finalInput),
    ).resolves.toMatchObject({ kind })
  })

  it.each([
    { kind: 'failed' as const, error: persistenceError },
    { kind: 'invalid_state' as const },
  ])('reports final queue-state failures %#', async (markResult) => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 4 },
      {
        kind: 'stored',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
      markResult,
    )
    const harness = createHarness(repository)
    await expect(harness.processTranscript(finalInput)).resolves.toMatchObject({
      kind: 'queue_pending',
    })
    expect(harness.publisher.errors[0]?.publication.stage).toBe(
      'refinement_queue',
    )
  })

  it('leaves a failed enqueue pending and reports it', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 4 },
      {
        kind: 'stored',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
    )
    const harness = createHarness(repository)
    harness.refinementQueue.result = {
      kind: 'failed',
      error: error('QUEUE_UNAVAILABLE'),
    }
    const result = await harness.processTranscript(finalInput)
    expect(result).toMatchObject({ kind: 'queue_pending' })
    expect(harness.publisher.errors[0]?.publication.stage).toBe(
      'refinement_queue',
    )
  })

  it('retries a duplicate with no draft', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'duplicate', segment: segmentOf(partialInput) },
      {
        kind: 'stored',
        segment: segmentOf(partialInput, { draftText: 'Xin chào' }),
      },
    )
    await createHarness(repository).processTranscript(partialInput)
    expect(callLog).toContain('translate')
  })

  it('republishes a duplicate partial without translation', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      {
        kind: 'duplicate',
        segment: segmentOf(partialInput, { draftText: 'Xin chào' }),
      },
      { kind: 'failed', error: persistenceError },
    )
    await createHarness(repository).processTranscript(partialInput)
    expect(callLog).toEqual(['getSession', 'accept', 'publishDraft'])
  })

  it('republishes and enqueues a pending duplicate final', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      {
        kind: 'duplicate',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
      { kind: 'failed', error: persistenceError },
    )
    await expect(
      createHarness(repository).processTranscript(finalInput),
    ).resolves.toMatchObject({ kind: 'queued' })
    expect(callLog).toEqual([
      'getSession',
      'accept',
      'publishDraft',
      'enqueue',
      'markQueued',
    ])
  })

  it.each([
    [
      finalInput,
      segmentOf(finalInput, { refinementStatus: 'PENDING' }),
      'draft',
    ],
    [
      partialInput,
      segmentOf(partialInput, {
        draftText: 'Xin chào',
        refinementStatus: 'PENDING',
      }),
      'draft',
    ],
    [
      finalInput,
      segmentOf(finalInput, { draftText: 'Xin chào' }),
      'refinement_queue',
    ],
  ] as const)(
    'reports inconsistent duplicate state %#',
    async (processInput, segment, stage) => {
      const repository = new FakeSessionStateRepository(
        callLog,
        foundSession,
        { kind: 'duplicate', segment },
        { kind: 'failed', error: persistenceError },
      )
      const harness = createHarness(repository)
      await expect(
        harness.processTranscript(processInput),
      ).resolves.toMatchObject({
        kind: 'failed',
        error: { code: 'INTERNAL_ERROR' },
      })
      expect(harness.publisher.errors[0]?.publication.stage).toBe(stage)
      expect(harness.translator.inputs).toEqual([])
      expect(harness.refinementQueue.references).toEqual([])
    },
  )

  it.each([
    ['QUEUED', 'already_queued'],
    ['COMPLETED', 'already_completed'],
  ] as const)('makes duplicate %s finals no-ops', async (status, kind) => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      {
        kind: 'duplicate',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: status,
        }),
      },
      { kind: 'failed', error: persistenceError },
    )
    await expect(
      createHarness(repository).processTranscript(finalInput),
    ).resolves.toEqual({ kind, reference: referenceOf(finalInput) })
    expect(callLog).toEqual(['getSession', 'accept'])
  })

  it('uses publisher-error precedence when reporting fails', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 3 },
      { kind: 'failed', error: persistenceError },
    )
    const harness = createHarness(repository)
    harness.translator.result = {
      kind: 'failed',
      error: error('PROVIDER_UNAVAILABLE'),
    }
    harness.publisher.errorResult = {
      kind: 'failed',
      error: error('PUBLISH_UNAVAILABLE'),
    }
    await expect(
      harness.processTranscript(partialInput),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'PUBLISH_UNAVAILABLE' },
    })
  })

  it.each([
    {
      kind: 'rejected' as const,
      error: {
        code: 'SEGMENT_CONFLICT' as const,
        message: 'Sequence belongs to another segment',
        retryable: false,
      },
    },
    { kind: 'failed' as const, error: persistenceError },
  ])(
    'publishes acceptance failures at the draft stage',
    async (acceptResult) => {
      const repository = new FakeSessionStateRepository(
        callLog,
        foundSession,
        acceptResult,
        { kind: 'failed', error: persistenceError },
      )
      const harness = createHarness(repository)
      await expect(harness.processTranscript(partialInput)).resolves.toEqual({
        kind: 'failed',
        error: acceptResult.error,
      })
      expect(harness.publisher.errors[0]?.publication).toMatchObject({
        stage: 'draft',
        error: acceptResult.error,
      })
    },
  )

  it('uses publisher-error precedence for queue error reporting', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 4 },
      {
        kind: 'stored',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
    )
    const harness = createHarness(repository)
    harness.refinementQueue.result = {
      kind: 'failed',
      error: error('QUEUE_UNAVAILABLE'),
    }
    harness.publisher.errorResult = {
      kind: 'failed',
      error: error('PUBLISH_UNAVAILABLE'),
    }
    await expect(harness.processTranscript(finalInput)).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'PUBLISH_UNAVAILABLE' },
    })
  })

  it('does not recursively report draft publication failures', async () => {
    const repository = new FakeSessionStateRepository(
      callLog,
      foundSession,
      { kind: 'accepted', revision: 4 },
      {
        kind: 'stored',
        segment: segmentOf(finalInput, {
          draftText: 'Xin chào',
          refinementStatus: 'PENDING',
        }),
      },
    )
    const harness = createHarness(repository)
    harness.publisher.draftResult = {
      kind: 'failed',
      error: error('PUBLISH_UNAVAILABLE'),
    }
    await harness.processTranscript(finalInput)
    expect(harness.publisher.errors).toEqual([])
    expect(harness.refinementQueue.references).toEqual([])
  })
})
