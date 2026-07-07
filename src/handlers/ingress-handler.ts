import type { APIGatewayProxyResult } from 'aws-lambda'

import { getBackendRuntime, type BackendRuntime } from '../composition'
import {
  decodeWebSocketCommand,
  toContractErrorEvent,
  type DecodeWebSocketCommandResult,
  type WebSocketCommand,
} from '../contracts'
import type { ApplicationError, SessionId } from '../domain'
import type { SessionConnection } from '../ports'
import { logError, logInfo } from './logging'
import {
  extractWebSocketContext,
  type WebSocketContext,
  type WebSocketRequestEvent,
} from './request-context'
import { badRequest, ok, serverError } from './responses'
import type {
  WebSocketControlEvent,
  WebSocketControlPublisher,
} from './websocket-control-publisher'

export type IngressRuntime = Pick<
  BackendRuntime,
  'startSession' | 'disconnectSession' | 'processTranscript'
> & {
  controlPublisher: Pick<WebSocketControlPublisher, 'publish'>
}
export type IngressRuntimeResolver = () =>
  IngressRuntime | Promise<IngressRuntime>

function commandBody(event: WebSocketRequestEvent): string {
  return typeof event.body === 'string' ? event.body : ''
}

function connectionFromContext(context: WebSocketContext): SessionConnection {
  return {
    connectionId: context.connectionId,
    callbackEndpoint: context.callbackEndpoint,
  }
}

function invalidCommandFailure(): Exclude<
  DecodeWebSocketCommandResult,
  { kind: 'decoded' }
> {
  return { kind: 'invalid_command' }
}

async function publishControl(
  runtime: IngressRuntime,
  connection: SessionConnection,
  event: WebSocketControlEvent,
): Promise<'published' | 'gone' | 'failed'> {
  const result = await runtime.controlPublisher.publish(connection, event)
  if (result.kind === 'published') return 'published'
  return result.error.code === 'CONNECTION_GONE' ? 'gone' : 'failed'
}

async function publishContractError(
  runtime: IngressRuntime,
  connection: SessionConnection,
  failure: Exclude<DecodeWebSocketCommandResult, { kind: 'decoded' }>,
): Promise<APIGatewayProxyResult> {
  const published = await publishControl(
    runtime,
    connection,
    toContractErrorEvent(failure),
  )
  return published === 'failed'
    ? serverError({ error: 'publication_failed' })
    : badRequest({ error: failure.kind })
}

function sessionErrorEvent(
  sessionId: SessionId,
  error: ApplicationError,
): WebSocketControlEvent {
  return {
    type: 'translation.error',
    stage: 'session',
    sessionId,
    code: error.code,
    retryable: error.retryable,
  }
}

async function handleDecodedCommand(input: {
  runtime: IngressRuntime
  context: WebSocketContext
  command: WebSocketCommand
}): Promise<APIGatewayProxyResult> {
  const connection = connectionFromContext(input.context)

  if (input.command.action === 'session.start') {
    const result = await input.runtime.startSession({
      sessionId: input.command.sessionId,
      sourceLanguage: input.command.sourceLanguage,
      targetLanguage: input.command.targetLanguage,
      connection,
    })

    if (result.kind === 'started' || result.kind === 'reattached') {
      const published = await publishControl(input.runtime, connection, {
        type: 'session.started',
        sessionId: result.sessionId,
      })
      return published === 'failed'
        ? serverError({ error: 'publication_failed' })
        : ok({ outcome: result.kind })
    }

    const published = await publishControl(
      input.runtime,
      connection,
      sessionErrorEvent(input.command.sessionId, result.error),
    )
    return published === 'failed'
      ? serverError({ error: 'publication_failed' })
      : ok({ outcome: result.kind })
  }

  const result = await input.runtime.processTranscript({
    sessionId: input.command.sessionId,
    segmentId: input.command.segmentId,
    sequence: input.command.sequence,
    revision: input.command.revision,
    sourceText: input.command.text,
    isFinal: input.command.isFinal,
    startMs: input.command.startMs,
    endMs: input.command.endMs,
  })
  logInfo({
    handler: 'ingress',
    routeKey: input.context.routeKey,
    connectionId: input.context.connectionId,
    ...(input.context.requestId ? { requestId: input.context.requestId } : {}),
    sessionId: input.command.sessionId,
    segmentId: input.command.segmentId,
    sequence: input.command.sequence,
    revision: input.command.revision,
    outcome: result.kind,
    ...(result.kind === 'failed' ? { errorCode: result.error.code } : {}),
  })
  return ok({ outcome: result.kind })
}

function routeMatches(routeKey: string, command: WebSocketCommand): boolean {
  return routeKey === '$default' || routeKey === command.action
}

export const createIngressHandler =
  (getRuntime: IngressRuntimeResolver) =>
  async (event: WebSocketRequestEvent): Promise<APIGatewayProxyResult> => {
    const routeKey = event.requestContext?.routeKey ?? '$default'

    if (routeKey === '$connect') {
      return ok({ outcome: 'connected' })
    }

    const contextResult = extractWebSocketContext(event)
    if (contextResult.kind === 'invalid_context') {
      logError({
        handler: 'ingress',
        routeKey,
        outcome: 'invalid_context',
      })
      return serverError({ error: 'invalid_context' })
    }

    let runtime: IngressRuntime
    try {
      runtime = await getRuntime()
    } catch (error) {
      logError({
        handler: 'ingress',
        routeKey,
        connectionId: contextResult.context.connectionId,
        ...(contextResult.context.requestId
          ? { requestId: contextResult.context.requestId }
          : {}),
        outcome: 'configuration_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      return serverError({ error: 'configuration_failed' })
    }

    if (routeKey === '$disconnect') {
      const result = await runtime.disconnectSession({
        connectionId: contextResult.context.connectionId,
      })
      logInfo({
        handler: 'ingress',
        routeKey,
        connectionId: contextResult.context.connectionId,
        ...(contextResult.context.requestId
          ? { requestId: contextResult.context.requestId }
          : {}),
        outcome: result.kind,
        ...(result.kind === 'failed' ? { errorCode: result.error.code } : {}),
      })
      return ok({ outcome: result.kind })
    }

    const decoded = decodeWebSocketCommand(commandBody(event))
    const connection = connectionFromContext(contextResult.context)

    if (decoded.kind !== 'decoded') {
      return publishContractError(runtime, connection, decoded)
    }
    if (!routeMatches(routeKey, decoded.command)) {
      return publishContractError(runtime, connection, invalidCommandFailure())
    }

    try {
      return await handleDecodedCommand({
        runtime,
        context: contextResult.context,
        command: decoded.command,
      })
    } catch (error) {
      logError({
        handler: 'ingress',
        routeKey,
        connectionId: contextResult.context.connectionId,
        ...(contextResult.context.requestId
          ? { requestId: contextResult.context.requestId }
          : {}),
        outcome: 'unexpected_exception',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      return serverError({ error: 'unexpected_exception' })
    }
  }

export const handler = createIngressHandler(getBackendRuntime)
