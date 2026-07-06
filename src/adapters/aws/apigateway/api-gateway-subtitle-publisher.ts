import {
  PostToConnectionCommand,
  type PostToConnectionCommandOutput,
} from '@aws-sdk/client-apigatewaymanagementapi'

import type {
  CorrelatedErrorPublication,
  DraftPublication,
  PublishResult,
  RefinedPublication,
  SessionConnection,
  SubtitlePublisher,
} from '../../../ports'
import {
  connectionGone,
  internalAdapterFailure,
  isAwsFailure,
  isConnectionGone,
  publishUnavailable,
} from '../errors'
import {
  toDraftEvent,
  toErrorEvent,
  toRefinedEvent,
  type PublishableWebSocketEvent,
} from './outbound-event-mapping'

export interface ApiGatewayCommandSender {
  send(command: PostToConnectionCommand): Promise<PostToConnectionCommandOutput>
}

export type ApiGatewayClientResolver = (
  callbackEndpoint: string,
) => ApiGatewayCommandSender

export class ApiGatewaySubtitlePublisher implements SubtitlePublisher {
  constructor(private readonly resolveClient: ApiGatewayClientResolver) {}

  publishDraft(
    connection: SessionConnection,
    publication: DraftPublication,
  ): Promise<PublishResult> {
    return this.publishMapped(connection, () => toDraftEvent(publication))
  }

  publishError(
    connection: SessionConnection,
    publication: CorrelatedErrorPublication,
  ): Promise<PublishResult> {
    return this.publishMapped(connection, () => toErrorEvent(publication))
  }

  publishRefined(
    connection: SessionConnection,
    publication: RefinedPublication,
  ): Promise<PublishResult> {
    return this.publishMapped(connection, () => toRefinedEvent(publication))
  }

  private async publishMapped(
    connection: SessionConnection,
    mapEvent: () => PublishableWebSocketEvent,
  ): Promise<PublishResult> {
    let event: PublishableWebSocketEvent
    try {
      event = mapEvent()
    } catch {
      return { kind: 'failed', error: internalAdapterFailure() }
    }

    try {
      const sender = this.resolveClient(connection.callbackEndpoint)
      await sender.send(
        new PostToConnectionCommand({
          ConnectionId: connection.connectionId,
          Data: new TextEncoder().encode(JSON.stringify(event)),
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
