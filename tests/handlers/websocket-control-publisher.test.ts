import {
  PostToConnectionCommand,
  type PostToConnectionCommandOutput,
} from '@aws-sdk/client-apigatewaymanagementapi'
import { describe, expect, it } from 'vitest'

import {
  ContractTranslationErrorEventSchema,
  SessionStartedEventSchema,
  SessionTranslationErrorEventSchema,
} from '../../src/contracts'
import {
  WebSocketControlPublisher,
  type WebSocketControlClientResolver,
} from '../../src/handlers/websocket-control-publisher'
import type { SessionConnection } from '../../src/ports'

const connection: SessionConnection = {
  connectionId: 'connection-1',
  callbackEndpoint: 'https://abc.execute-api.ap-southeast-1.amazonaws.com/prod',
}

class ScriptedSender {
  command?: PostToConnectionCommand
  constructor(private readonly thrown?: unknown) {}
  async send(
    command: PostToConnectionCommand,
  ): Promise<PostToConnectionCommandOutput> {
    this.command = command
    if (this.thrown !== undefined) throw this.thrown
    return {} as PostToConnectionCommandOutput
  }
}

function decoded(command: PostToConnectionCommand | undefined): unknown {
  return JSON.parse(new TextDecoder().decode(command?.input.Data as Uint8Array))
}

describe('WebSocketControlPublisher', () => {
  it('publishes session, contract error, and session error events', async () => {
    const sender = new ScriptedSender()
    const endpoints: string[] = []
    const resolver: WebSocketControlClientResolver = (endpoint) => {
      endpoints.push(endpoint)
      return sender
    }
    const publisher = new WebSocketControlPublisher(resolver)

    await expect(
      publisher.publish(connection, {
        type: 'session.started',
        sessionId: '0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
      }),
    ).resolves.toEqual({ kind: 'published' })
    expect(
      SessionStartedEventSchema.parse(decoded(sender.command)),
    ).toMatchObject({
      type: 'session.started',
    })

    await publisher.publish(connection, {
      type: 'translation.error',
      stage: 'contract',
      code: 'INVALID_INPUT',
      retryable: false,
    })
    expect(
      ContractTranslationErrorEventSchema.parse(decoded(sender.command)),
    ).toMatchObject({ stage: 'contract' })

    await publisher.publish(connection, {
      type: 'translation.error',
      stage: 'session',
      sessionId: '0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
      code: 'INVALID_INPUT',
      retryable: false,
    })
    expect(
      SessionTranslationErrorEventSchema.parse(decoded(sender.command)),
    ).toMatchObject({ stage: 'session' })

    expect(sender.command?.input.ConnectionId).toBe('connection-1')
    expect(endpoints).toEqual(Array(3).fill(connection.callbackEndpoint))
  })

  it.each([
    [
      { name: 'GoneException', $metadata: { httpStatusCode: 410 } },
      'CONNECTION_GONE',
    ],
    [
      { name: 'ServiceUnavailableException', $fault: 'server' },
      'PUBLISH_UNAVAILABLE',
    ],
    [new Error('unknown'), 'INTERNAL_ERROR'],
  ])('normalizes publication failure %#', async (thrown, code) => {
    const publisher = new WebSocketControlPublisher(
      () => new ScriptedSender(thrown),
    )
    await expect(
      publisher.publish(connection, {
        type: 'session.started',
        sessionId: '0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
      }),
    ).resolves.toMatchObject({ kind: 'failed', error: { code } })
  })

  it('rejects invalid local events before resolving a client', async () => {
    let resolutions = 0
    const publisher = new WebSocketControlPublisher(() => {
      resolutions += 1
      return new ScriptedSender()
    })

    await expect(
      publisher.publish(connection, {
        type: 'translation.error',
        stage: 'session',
        sessionId: 'bad',
        code: 'INVALID_INPUT',
        retryable: false,
      } as never),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    })
    expect(resolutions).toBe(0)
  })
})
