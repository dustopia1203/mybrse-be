import { describe, expect, it } from 'vitest'

import { createStartSession } from '../../../src/application/session/start-session'
import type { ApplicationError } from '../../../src/domain'
import type {
  SessionLifecycleRepository,
  StartOrReattachSessionInput,
  StartOrReattachSessionResult,
} from '../../../src/ports/session-lifecycle-repository'

class StubSessionLifecycleRepository implements SessionLifecycleRepository {
  receivedInput: StartOrReattachSessionInput | undefined

  constructor(private readonly result: StartOrReattachSessionResult) {}

  async startOrReattach(
    input: StartOrReattachSessionInput,
  ): Promise<StartOrReattachSessionResult> {
    this.receivedInput = input
    return this.result
  }

  async detachByConnectionId(): Promise<{ kind: 'not_found' }> {
    return { kind: 'not_found' }
  }
}

const input = {
  sessionId: 's-123',
  sourceLanguage: 'ja',
  targetLanguage: 'vi',
  connection: {
    connectionId: 'connection-1',
    callbackEndpoint: 'https://api.example.com/dev',
  },
}

const createUseCase = (
  repositoryResult: StartOrReattachSessionResult,
): {
  repository: StubSessionLifecycleRepository
  startSession: ReturnType<typeof createStartSession>
} => {
  const repository = new StubSessionLifecycleRepository(repositoryResult)
  return {
    repository,
    startSession: createStartSession({
      repository,
      nowMs: () => 1_750_000_000_123,
      sessionRetentionSeconds: 86_400,
    }),
  }
}

describe('createStartSession', () => {
  it('starts a newly created session with its connection', async () => {
    const { repository, startSession } = createUseCase({ kind: 'created' })

    await expect(startSession(input)).resolves.toEqual({
      kind: 'started',
      sessionId: 's-123',
    })
    expect(repository.receivedInput).toEqual({
      session: {
        sessionId: 's-123',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        createdAtMs: 1_750_000_000_123,
        expiresAt: 1_750_086_400,
      },
      connection: {
        connectionId: 'connection-1',
        callbackEndpoint: 'https://api.example.com/dev',
      },
    })
  })

  it('reports an existing session as reattached', async () => {
    const { startSession } = createUseCase({ kind: 'reattached' })

    await expect(startSession(input)).resolves.toEqual({
      kind: 'reattached',
      sessionId: 's-123',
    })
  })

  it('rejects a connection to a session with a different language pair', async () => {
    const { startSession } = createUseCase({ kind: 'language_conflict' })

    await expect(startSession(input)).resolves.toEqual({
      kind: 'rejected',
      error: {
        code: 'INVALID_INPUT',
        message: 'Session language pair does not match the existing session',
        retryable: false,
      },
    })
  })

  it('passes through a persistence failure', async () => {
    const error: ApplicationError = {
      code: 'PERSISTENCE_UNAVAILABLE',
      message: 'Session storage is unavailable',
      retryable: true,
    }
    const { startSession } = createUseCase({ kind: 'failed', error })

    await expect(startSession(input)).resolves.toEqual({
      kind: 'failed',
      error,
    })
  })
})
