import {
  PostToConnectionCommand,
  type PostToConnectionCommandOutput,
} from '@aws-sdk/client-apigatewaymanagementapi'
import { describe, expect, it } from 'vitest'

import {
  ApiGatewaySubtitlePublisher,
  type ApiGatewayCommandSender,
} from '../../../../src/adapters/aws/apigateway'
import {
  SubtitleDraftEventSchema,
  SubtitleRefinedEventSchema,
  TranslationErrorEventSchema,
} from '../../../../src/contracts'
import type { SubtitlePublisher } from '../../../../src/ports'
import { SEGMENT_ID, SESSION_ID } from '../../../fixtures/ids'

const connection = {
  connectionId: 'connection-1',
  callbackEndpoint: 'https://api.example.com/prod',
}
const reference = {
  sessionId: SESSION_ID,
  segmentId: SEGMENT_ID,
  sequence: 10,
  revision: 4,
}

class ScriptedSender implements ApiGatewayCommandSender {
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

describe('ApiGatewaySubtitlePublisher', () => {
  it('publishes draft, refined, and error events through the retained endpoint', async () => {
    const sender = new ScriptedSender()
    const endpoints: string[] = []
    const publisher: SubtitlePublisher = new ApiGatewaySubtitlePublisher(
      (endpoint) => {
        endpoints.push(endpoint)
        return sender
      },
    )

    await expect(
      publisher.publishDraft(connection, {
        reference,
        text: 'Xin chào',
        isFinal: false,
      }),
    ).resolves.toEqual({ kind: 'published' })
    expect(
      SubtitleDraftEventSchema.parse(decoded(sender.command)),
    ).toMatchObject({
      type: 'subtitle.draft',
    })

    await publisher.publishRefined(connection, {
      reference,
      text: 'Xin chào.',
    })
    expect(
      SubtitleRefinedEventSchema.parse(decoded(sender.command)),
    ).toMatchObject({
      type: 'subtitle.refined',
    })

    await publisher.publishError(connection, {
      stage: 'draft',
      reference,
      error: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'private',
        retryable: true,
      },
    })
    expect(
      TranslationErrorEventSchema.parse(decoded(sender.command)),
    ).toMatchObject({
      type: 'translation.error',
      stage: 'draft',
    })
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
    const publisher = new ApiGatewaySubtitlePublisher(
      () => new ScriptedSender(thrown),
    )
    await expect(
      publisher.publishRefined(connection, {
        reference,
        text: 'Xin chào.',
      }),
    ).resolves.toMatchObject({ kind: 'failed', error: { code } })
  })

  it('does not resolve a client for invalid local mapping', async () => {
    let resolutions = 0
    const publisher = new ApiGatewaySubtitlePublisher(() => {
      resolutions += 1
      return new ScriptedSender()
    })
    await expect(
      publisher.publishDraft(connection, {
        reference: { ...reference, sequence: -1 } as never,
        text: 'invalid',
        isFinal: false,
      }),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    })
    expect(resolutions).toBe(0)
  })
})
