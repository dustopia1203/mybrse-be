import { randomBytes } from 'node:crypto'

import {
  SegmentIdSchema,
  SessionIdSchema,
  type SegmentId,
  type SessionId,
} from '../../../../src/domain'
import {
  RefinementJobSchema,
  type RefinementJob,
} from '../../../../src/contracts'

export interface TestRunRegistry {
  readonly runId: string
  readonly sessionIds: Set<string>
  readonly segmentIds: Set<string>
  readonly connectionIds: Set<string>
  readonly expectedQueueJobs: Map<string, RefinementJob>
  readonly removedQueueSessionIds: Set<string>
}

export function generateUuidV7(
  nowMs = Date.now(),
  entropy: Uint8Array = randomBytes(10),
): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > 281_474_976_710_655) {
    throw new RangeError(
      'UUID v7 timestamp must be a 48-bit Unix millisecond value',
    )
  }
  if (entropy.length !== 10) {
    throw new RangeError('UUID v7 entropy must contain exactly 10 bytes')
  }

  const bytes = new Uint8Array(16)
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = (nowMs / 256 ** (5 - index)) % 256
  }
  bytes[6] = 0x70 | (entropy[0]! & 0x0f)
  bytes[7] = entropy[1]!
  bytes[8] = 0x80 | (entropy[2]! & 0x3f)
  bytes.set(entropy.slice(3), 9)

  const hex = Buffer.from(bytes).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createTestRunRegistry(): TestRunRegistry {
  return {
    runId: generateUuidV7(),
    sessionIds: new Set(),
    segmentIds: new Set(),
    connectionIds: new Set(),
    expectedQueueJobs: new Map(),
    removedQueueSessionIds: new Set(),
  }
}

export function registerSessionId(registry: TestRunRegistry): SessionId {
  const sessionId = SessionIdSchema.parse(generateUuidV7())
  registry.sessionIds.add(sessionId)
  return sessionId
}

export function registerSegmentId(registry: TestRunRegistry): SegmentId {
  const segmentId = SegmentIdSchema.parse(generateUuidV7())
  registry.segmentIds.add(segmentId)
  return segmentId
}

export function registerConnectionId(
  registry: TestRunRegistry,
  scenario: string,
): string {
  const connectionId = `integration-${registry.runId}-${scenario}`
  registry.connectionIds.add(connectionId)
  return connectionId
}

export function registerExpectedQueueJob(
  registry: TestRunRegistry,
  job: RefinementJob,
): void {
  const parsedJob = RefinementJobSchema.parse(job)
  if (
    !registry.sessionIds.has(parsedJob.sessionId) ||
    !registry.segmentIds.has(parsedJob.segmentId)
  ) {
    throw new Error(
      'Expected queue job must use registered session and segment IDs',
    )
  }
  registry.expectedQueueJobs.set(parsedJob.sessionId, parsedJob)
}

export function markQueueJobRemoved(
  registry: TestRunRegistry,
  sessionId: string,
): void {
  registry.removedQueueSessionIds.add(sessionId)
}
