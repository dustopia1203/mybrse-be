import type { SessionConnection } from '../ports'

export interface WebSocketRequestEvent {
  body?: string | null
  requestContext?: {
    routeKey?: string
    connectionId?: string
    domainName?: string
    stage?: string
    requestId?: string
  }
}

export interface WebSocketContext {
  routeKey: string
  connectionId: string
  callbackEndpoint: string
  requestId?: string
}

export type WebSocketContextResult =
  | { kind: 'extracted'; context: WebSocketContext }
  | {
      kind: 'invalid_context'
      missingFields: string[]
      routeKey?: string
    }

export type ExtractConnectionResult =
  | { kind: 'extracted'; connection: SessionConnection }
  | {
      kind: 'invalid_context'
      missingFields: string[]
      routeKey?: string
    }

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

export function extractWebSocketContext(
  event: WebSocketRequestEvent,
): WebSocketContextResult {
  const requestContext = event.requestContext
  const missingFields: string[] = []

  if (!nonEmpty(requestContext?.connectionId))
    missingFields.push('connectionId')
  if (!nonEmpty(requestContext?.domainName)) missingFields.push('domainName')
  if (!nonEmpty(requestContext?.stage)) missingFields.push('stage')

  if (missingFields.length > 0) {
    return {
      kind: 'invalid_context',
      missingFields,
      ...(nonEmpty(requestContext?.routeKey)
        ? { routeKey: requestContext.routeKey }
        : {}),
    }
  }

  const connectionId = requestContext?.connectionId
  const domainName = requestContext?.domainName
  const stage = requestContext?.stage
  if (!nonEmpty(connectionId) || !nonEmpty(domainName) || !nonEmpty(stage)) {
    return {
      kind: 'invalid_context',
      missingFields: ['connectionId', 'domainName', 'stage'],
    }
  }

  return {
    kind: 'extracted',
    context: {
      routeKey: nonEmpty(requestContext?.routeKey)
        ? requestContext.routeKey
        : '$default',
      connectionId,
      callbackEndpoint: `https://${domainName}/${stage}`,
      ...(nonEmpty(requestContext?.requestId)
        ? { requestId: requestContext.requestId }
        : {}),
    },
  }
}

export function extractConnection(
  event: WebSocketRequestEvent,
): ExtractConnectionResult {
  const result = extractWebSocketContext(event)
  if (result.kind === 'invalid_context') return result
  return {
    kind: 'extracted',
    connection: {
      connectionId: result.context.connectionId,
      callbackEndpoint: result.context.callbackEndpoint,
    },
  }
}
