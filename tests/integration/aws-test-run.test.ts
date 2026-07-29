import { describe, expect, it } from 'vitest'

import { SessionIdSchema } from '../../src/domain'
import {
  createTestRunRegistry,
  generateUuidV7,
  registerConnectionId,
  registerSessionId,
} from './aws/support/test-run'

describe('live AWS test-run identity', () => {
  it('generates a canonical UUID v7 from fixed time and entropy', () => {
    const value = generateUuidV7(
      1_750_000_000_000,
      Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    )
    expect(SessionIdSchema.parse(value)).toBe(value)
    expect(value[14]).toBe('7')
    expect(['8', '9', 'a', 'b']).toContain(value[19])
  })

  it('registers identifiers before they can establish ownership', () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const connectionId = registerConnectionId(registry, 'lifecycle')
    expect(registry.sessionIds.has(sessionId)).toBe(true)
    expect(registry.connectionIds.has(connectionId)).toBe(true)
    expect(connectionId).toBe(`integration-${registry.runId}-lifecycle`)
  })
})
