import { describe, expect, it } from 'vitest'

import {
  extractConnection,
  extractWebSocketContext,
  type WebSocketRequestEvent,
} from '../../src/handlers/request-context'

const event = {
  body: '{}',
  requestContext: {
    routeKey: 'session.start',
    connectionId: 'connection-1',
    domainName: 'abc.execute-api.ap-southeast-1.amazonaws.com',
    stage: 'prod',
    requestId: 'request-1',
  },
} as WebSocketRequestEvent

describe('WebSocket request context', () => {
  it('extracts route and connection metadata', () => {
    expect(extractWebSocketContext(event)).toEqual({
      kind: 'extracted',
      context: {
        routeKey: 'session.start',
        connectionId: 'connection-1',
        callbackEndpoint:
          'https://abc.execute-api.ap-southeast-1.amazonaws.com/prod',
        requestId: 'request-1',
      },
    })
    expect(extractConnection(event)).toEqual({
      kind: 'extracted',
      connection: {
        connectionId: 'connection-1',
        callbackEndpoint:
          'https://abc.execute-api.ap-southeast-1.amazonaws.com/prod',
      },
    })
  })

  it('reports missing required fields without throwing', () => {
    const missing = {
      requestContext: { routeKey: '$connect' },
    } as WebSocketRequestEvent
    expect(extractWebSocketContext(missing)).toEqual({
      kind: 'invalid_context',
      missingFields: ['connectionId', 'domainName', 'stage'],
      routeKey: '$connect',
    })
  })
})
