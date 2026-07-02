import { describe, expect, it } from 'vitest'

import {
  createDisconnectSession,
  createStartSession,
} from '../../../src/application/session'
import { InMemorySessionLifecycleRepository } from '../../fakes/in-memory-session-lifecycle-repository'

describe('session lifecycle', () => {
  it('preserves session identity while connections reattach and disconnect', async () => {
    const repository = new InMemorySessionLifecycleRepository()
    let currentTimeMs = 1_750_000_000_123
    const startSession = createStartSession({
      repository,
      nowMs: () => currentTimeMs,
      sessionRetentionSeconds: 86_400,
    })
    const disconnectSession = createDisconnectSession({ repository })

    await expect(
      startSession({
        sessionId: 's-123',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        connection: {
          connectionId: 'connection-1',
          callbackEndpoint: 'https://api.example.com/dev',
        },
      }),
    ).resolves.toEqual({ kind: 'started', sessionId: 's-123' })
    expect(repository.sessions.get('s-123')).toEqual({
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

    currentTimeMs = 1_750_003_600_123
    await expect(
      startSession({
        sessionId: 's-123',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        connection: {
          connectionId: 'connection-2',
          callbackEndpoint: 'https://api.example.com/dev',
        },
      }),
    ).resolves.toEqual({ kind: 'reattached', sessionId: 's-123' })
    expect(repository.sessions.get('s-123')).toEqual({
      session: {
        sessionId: 's-123',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        createdAtMs: 1_750_000_000_123,
        expiresAt: 1_750_086_400,
      },
      connection: {
        connectionId: 'connection-2',
        callbackEndpoint: 'https://api.example.com/dev',
      },
    })

    await expect(
      startSession({
        sessionId: 's-123',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        connection: {
          connectionId: 'connection-3',
          callbackEndpoint: 'https://api.example.com/dev',
        },
      }),
    ).resolves.toEqual({
      kind: 'rejected',
      error: {
        code: 'INVALID_INPUT',
        message: 'Session language pair does not match the existing session',
        retryable: false,
      },
    })
    expect(repository.sessions.get('s-123')?.connection?.connectionId).toBe(
      'connection-2',
    )

    await expect(
      disconnectSession({ connectionId: 'connection-1' }),
    ).resolves.toEqual({ kind: 'superseded' })
    expect(repository.sessions.get('s-123')?.connection?.connectionId).toBe(
      'connection-2',
    )

    await expect(
      disconnectSession({ connectionId: 'connection-2' }),
    ).resolves.toEqual({ kind: 'detached' })
    expect(repository.sessions.get('s-123')).toEqual({
      session: {
        sessionId: 's-123',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        createdAtMs: 1_750_000_000_123,
        expiresAt: 1_750_086_400,
      },
      connection: undefined,
    })

    await expect(
      disconnectSession({ connectionId: 'connection-missing' }),
    ).resolves.toEqual({ kind: 'not_found' })
    expect(repository.sessions.has('s-123')).toBe(true)
  })

  it('transfers one connection between sessions before disconnecting it', async () => {
    const repository = new InMemorySessionLifecycleRepository()
    const startSession = createStartSession({
      repository,
      nowMs: () => 1_750_000_000_123,
      sessionRetentionSeconds: 86_400,
    })
    const disconnectSession = createDisconnectSession({ repository })
    const connection = {
      connectionId: 'connection-1',
      callbackEndpoint: 'https://api.example.com/dev',
    }

    await expect(
      startSession({
        sessionId: 's-1',
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        connection,
      }),
    ).resolves.toEqual({ kind: 'started', sessionId: 's-1' })
    await expect(
      startSession({
        sessionId: 's-2',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        connection,
      }),
    ).resolves.toEqual({ kind: 'started', sessionId: 's-2' })

    expect(repository.sessions.get('s-1')?.connection).toBeUndefined()
    expect(repository.sessions.get('s-2')?.connection).toEqual(connection)
    expect(repository.connectionToSession.get('connection-1')).toBe('s-2')

    await expect(
      disconnectSession({ connectionId: 'connection-1' }),
    ).resolves.toEqual({ kind: 'detached' })
    expect(repository.sessions.get('s-2')?.connection).toBeUndefined()
    expect(repository.sessions.has('s-1')).toBe(true)
    expect(repository.sessions.has('s-2')).toBe(true)
  })
})
