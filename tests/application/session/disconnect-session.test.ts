import { describe, expect, it } from 'vitest'

import { createDisconnectSession } from '../../../src/application/session'
import type { ApplicationError } from '../../../src/domain'
import type {
  DetachByConnectionIdResult,
  SessionLifecycleRepository,
  StartOrReattachSessionInput,
  StartOrReattachSessionResult,
} from '../../../src/ports/session-lifecycle-repository'

class StubSessionLifecycleRepository implements SessionLifecycleRepository {
  readonly detachedConnectionIds: string[] = []

  constructor(private readonly detachResult: DetachByConnectionIdResult) {}

  async startOrReattach(
    _input: StartOrReattachSessionInput,
  ): Promise<StartOrReattachSessionResult> {
    return { kind: 'created' }
  }

  async detachByConnectionId(
    connectionId: string,
  ): Promise<DetachByConnectionIdResult> {
    this.detachedConnectionIds.push(connectionId)
    return this.detachResult
  }
}

const persistenceUnavailableError: ApplicationError = {
  code: 'PERSISTENCE_UNAVAILABLE',
  message: 'Session storage is unavailable',
  retryable: true,
}

describe('createDisconnectSession', () => {
  it.each<{
    outcome: DetachByConnectionIdResult
  }>([
    { outcome: { kind: 'detached' } },
    { outcome: { kind: 'not_found' } },
    { outcome: { kind: 'superseded' } },
    {
      outcome: {
        kind: 'failed',
        error: persistenceUnavailableError,
      },
    },
  ])(
    'returns the exact $outcome.kind repository outcome',
    async ({ outcome }) => {
      const repository = new StubSessionLifecycleRepository(outcome)
      const disconnectSession = createDisconnectSession({ repository })

      await expect(
        disconnectSession({ connectionId: 'connection-1' }),
      ).resolves.toEqual(outcome)
      expect(repository.detachedConnectionIds).toEqual(['connection-1'])
    },
  )
})
