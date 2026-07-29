import { describe, expect, it } from 'vitest'

import { SessionIdSchema } from '../../src/domain'
import {
  createTestRunRegistry,
  generateUuidV7,
  registerConnectionId,
  registerExpectedQueueJob,
  registerSegmentId,
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

  it('rejects UUID v7 timestamps outside 48-bit milliseconds and wrong entropy length', () => {
    expect(() => generateUuidV7(-1)).toThrow()
    expect(() => generateUuidV7(281_474_976_710_656)).toThrow()
    expect(() => generateUuidV7(0, Uint8Array.from([0]))).toThrow()
  })

  it('rejects expected queue jobs before their identifiers are registered', () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const segmentId = registerSegmentId(registry)

    expect(() =>
      registerExpectedQueueJob(registry, {
        sessionId: generateUuidV7(),
        segmentId,
        sequence: 3,
        revision: 2,
      }),
    ).toThrow('Expected queue job must use registered session and segment IDs')
    expect(() =>
      registerExpectedQueueJob(registry, {
        sessionId,
        segmentId: generateUuidV7(),
        sequence: 3,
        revision: 2,
      }),
    ).toThrow('Expected queue job must use registered session and segment IDs')
  })
})
