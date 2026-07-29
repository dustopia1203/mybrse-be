import { describe, expect, it } from 'vitest'

import { assertOwnedDynamoKey, ownedQueueJob } from './aws/support/cleanup'
import {
  createTestRunRegistry,
  registerConnectionId,
  registerExpectedQueueJob,
  registerSegmentId,
  registerSessionId,
} from './aws/support/test-run'

describe('live AWS cleanup ownership guards', () => {
  it('accepts only registered session and connection keys', () => {
    const registry = createTestRunRegistry()
    const sessionId = registerSessionId(registry)
    const connectionId = registerConnectionId(registry, 'cleanup')
    expect(() =>
      assertOwnedDynamoKey(registry, {
        PK: `SESSION#${sessionId}`,
        SK: 'SEGMENT#0000000001',
      }),
    ).not.toThrow()
    expect(() =>
      assertOwnedDynamoKey(registry, {
        PK: `CONNECTION#${connectionId}`,
        SK: 'META',
      }),
    ).not.toThrow()
    expect(() =>
      assertOwnedDynamoKey(registry, {
        PK: 'SESSION#0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
        SK: 'META',
      }),
    ).toThrow('Refusing to delete an unowned DynamoDB key')
  })

  it('rejects malformed DynamoDB key fields with the fixed error', () => {
    const registry = createTestRunRegistry()
    const invalidKeys: unknown[] = [
      { PK: undefined, SK: 'META' },
      { PK: `SESSION#${registerSessionId(registry)}`, SK: undefined },
      { PK: 42, SK: 'META' },
      { PK: `SESSION#${registerSessionId(registry)}`, SK: '' },
    ]

    for (const key of invalidKeys) {
      expect(() =>
        assertOwnedDynamoKey(registry, key as { PK: string; SK: string }),
      ).toThrow('Refusing to delete an unowned DynamoDB key')
    }
  })

  it('returns only the exact registered queue job', () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 3,
      revision: 2,
    }
    registerExpectedQueueJob(registry, job)
    expect(ownedQueueJob(registry, JSON.stringify(job))).toEqual(job)
    const alteredSessionId = registerSessionId(registry)
    const alteredSegmentId = registerSegmentId(registry)
    for (const mismatchedJob of [
      { ...job, sessionId: alteredSessionId },
      { ...job, segmentId: alteredSegmentId },
      { ...job, sequence: 4 },
      { ...job, revision: 3 },
    ]) {
      expect(
        ownedQueueJob(registry, JSON.stringify(mismatchedJob)),
      ).toBeUndefined()
    }
    expect(ownedQueueJob(registry, '{bad json')).toBeUndefined()
  })

  it('rejects a queue job when its mutable map entry has another session', () => {
    const registry = createTestRunRegistry()
    const job = {
      sessionId: registerSessionId(registry),
      segmentId: registerSegmentId(registry),
      sequence: 3,
      revision: 2,
    }
    registerExpectedQueueJob(registry, job)
    registry.expectedQueueJobs.set(job.sessionId, {
      ...job,
      sessionId: registerSessionId(registry),
    })

    expect(ownedQueueJob(registry, JSON.stringify(job))).toBeUndefined()
  })
})
