import {
  PostToConnectionCommand,
  type PostToConnectionCommandOutput,
} from '@aws-sdk/client-apigatewaymanagementapi'

import {
  connectionGone,
  internalAdapterFailure,
  isAwsFailure,
  isConnectionGone,
  publishUnavailable,
} from '../adapters/aws/errors'
import {
  ContractTranslationErrorEventSchema,
  SessionStartedEventSchema,
  SessionTranslationErrorEventSchema,
  type ContractTranslationErrorEvent,
  type SessionStartedEvent,
  type SessionTranslationErrorEvent,
} from '../contracts'
import type { PublishResult, SessionConnection } from '../ports'

export interface WebSocketControlCommandSender {
  send(
    command: PostToConnectionCommand,
  ): Promise<PostToConnectionCommandOutput>
}

export type WebSocketControlClientResolver = (
  callbackEndpoint: string,
) => WebSocketControlCommandSender

export type WebSocketControlEvent =
  | SessionStartedEvent
  | ContractTranslationErrorEvent
  | SessionTranslationErrorEvent

function parseControlEvent(event: WebSocketControlEvent): WebSocketControlEvent {
  if (event.type === 'session.started') {
    return SessionStartedEventSchema.parse(event)
  }
  if (event.stage === 'contract') {
    return ContractTranslationErrorEventSchema.parse(event)
  }
  return SessionTranslationErrorEventSchema.parse(event)
}

export class WebSocketControlPublisher {
  constructor(private readonly resolveClient: WebSocketControlClientResolver) {}

  async publish(
    connection: SessionConnection,
    event: WebSocketControlEvent,
  ): Promise<PublishResult> {
    let parsed: WebSocketControlEvent
    try {
      parsed = parseControlEvent(event)
    } catch {
      return { kind: 'failed', error: internalAdapterFailure() }
    }

    try {
      const sender = this.resolveClient(connection.callbackEndpoint)
      await sender.send(
        new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: new TextEncoder().encode(JSON.stringify(parsed)),
        }),
      )
      return { kind: 'published' }
    } catch (error) {
      if (isConnectionGone(error)) {
        return { kind: 'failed', error: connectionGone() }
      }
      return {
        kind: 'failed',
        error: isAwsFailure(error)
          ? publishUnavailable()
          : internalAdapterFailure(),
      }
    }
  }
}
