import { describe, expect, it } from 'vitest'

import {
  createIngressHandler,
  type IngressRuntime,
} from '../../src/handlers/ingress-handler'
import type { WebSocketRequestEvent } from '../../src/handlers/request-context'
import type { WebSocketControlEvent } from '../../src/handlers/websocket-control-publisher'

const baseContext = {
  connectionId: 'connection-1',
  domainName: 'abc.execute-api.ap-southeast-1.amazonaws.com',
  stage: 'prod',
  requestId: 'request-1',
}

const sessionId = '0192f3a0-7b5c-7c8d-8e9f-0123456789ab'
const segmentId = '0192f3a0-7b5e-7abc-9def-0123456789ab'

function event(routeKey: string, body: unknown): WebSocketRequestEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { ...baseContext, routeKey },
  }
}

function runtime(
  overrides: Partial<IngressRuntime> = {},
): IngressRuntime & { published: WebSocketControlEvent[] } {
  const published: WebSocketControlEvent[] = []
  return {
    published,
    startSession: async () => ({ kind: 'started' as const, sessionId }),
    disconnectSession: async () => ({ kind: 'detached' as const }),
    processTranscript: async () => ({
      kind: 'published' as const,
      reference: { sessionId, segmentId, sequence: 10, revision: 4 },
      isFinal: false as const,
    }),
    controlPublisher: {
      publish: async (
        _connection: unknown,
        controlEvent: WebSocketControlEvent,
      ) => {
        published.push(controlEvent)
        return { kind: 'published' as const }
      },
    },
    ...overrides,
  }
}

describe('ingress handler', () => {
  it('accepts connect without calling runtime use cases', async () => {
    let runtimeCalls = 0
    const handler = createIngressHandler(() => {
      runtimeCalls += 1
      return runtime()
    })
    await expect(handler(event('$connect', null))).resolves.toMatchObject({
      statusCode: 200,
    })
    expect(runtimeCalls).toBe(0)
  })

  it('disconnects by connection ID and always acknowledges', async () => {
    const calls: unknown[] = []
    const handler = createIngressHandler(() =>
      runtime({
        disconnectSession: async (input: unknown) => {
          calls.push(input)
          return {
            kind: 'failed',
            error: {
              code: 'INTERNAL_ERROR',
              message: 'safe',
              retryable: true,
            },
          }
        },
      }),
    )
    await expect(handler(event('$disconnect', null))).resolves.toMatchObject({
      statusCode: 200,
    })
    expect(calls).toEqual([{ connectionId: 'connection-1' }])
  })

  it('starts a session and publishes session.started', async () => {
    const fakeRuntime = runtime()
    const handler = createIngressHandler(() => fakeRuntime)
    await expect(
      handler(
        event('session.start', {
          action: 'session.start',
          sessionId,
          sourceLanguage: 'ja',
          targetLanguage: 'vi',
        }),
      ),
    ).resolves.toMatchObject({ statusCode: 200 })
    expect(fakeRuntime.published).toEqual([
      { type: 'session.started', sessionId },
    ])
  })

  it('publishes session-stage errors for rejected starts', async () => {
    const fakeRuntime = runtime({
      startSession: async () => ({
        kind: 'rejected',
        error: { code: 'INVALID_INPUT', message: 'private', retryable: false },
      }),
    })
    const handler = createIngressHandler(() => fakeRuntime)
    await expect(
      handler(
        event('session.start', {
          action: 'session.start',
          sessionId,
          sourceLanguage: 'ja',
          targetLanguage: 'vi',
        }),
      ),
    ).resolves.toMatchObject({ statusCode: 200 })
    expect(fakeRuntime.published).toEqual([
      {
        type: 'translation.error',
        stage: 'session',
        sessionId,
        code: 'INVALID_INPUT',
        retryable: false,
      },
    ])
  })

  it('passes transcript upserts to the draft workflow', async () => {
    const calls: unknown[] = []
    const handler = createIngressHandler(() =>
      runtime({
        processTranscript: async (input: unknown) => {
          calls.push(input)
          return {
            kind: 'published',
            reference: { sessionId, segmentId, sequence: 10, revision: 4 },
            isFinal: false as const,
          }
        },
      }),
    )
    await expect(
      handler(
        event('transcript.upsert', {
          action: 'transcript.upsert',
          sessionId,
          segmentId,
          sequence: 10,
          revision: 4,
          text: 'こんにちは',
          isFinal: true,
          startMs: 1000,
          endMs: 2000,
        }),
      ),
    ).resolves.toMatchObject({ statusCode: 200 })
    expect(calls).toHaveLength(1)
  })

  it('publishes contract errors for invalid default-route messages', async () => {
    const fakeRuntime = runtime()
    const handler = createIngressHandler(() => fakeRuntime)
    await expect(
      handler(event('$default', { action: 'unknown.action' })),
    ).resolves.toMatchObject({ statusCode: 400 })
    expect(fakeRuntime.published).toEqual([
      {
        type: 'translation.error',
        stage: 'contract',
        code: 'UNSUPPORTED_ACTION',
        retryable: false,
      },
    ])
  })

  it('rejects custom route and body action mismatches', async () => {
    const fakeRuntime = runtime()
    const handler = createIngressHandler(() => fakeRuntime)
    await expect(
      handler(
        event('session.start', {
          action: 'transcript.upsert',
          sessionId,
          segmentId,
          sequence: 10,
          revision: 4,
          text: 'こんにちは',
          isFinal: true,
          startMs: 1000,
          endMs: 2000,
        }),
      ),
    ).resolves.toMatchObject({ statusCode: 400 })
    expect(fakeRuntime.published[0]).toMatchObject({
      type: 'translation.error',
      stage: 'contract',
      code: 'INVALID_INPUT',
    })
  })

  it('returns 500 when required request context is missing', async () => {
    const handler = createIngressHandler(() => runtime())
    await expect(
      handler({ requestContext: { routeKey: 'session.start' } }),
    ).resolves.toMatchObject({ statusCode: 500 })
  })
})
