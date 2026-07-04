import type { Sequence, SessionId } from '../../../domain'

export interface DynamoDbKey {
  PK: string
  SK: string
}

export function sessionKey(sessionId: SessionId): DynamoDbKey {
  return { PK: `SESSION#${sessionId}`, SK: 'META' }
}

export function connectionKey(connectionId: string): DynamoDbKey {
  return { PK: `CONNECTION#${connectionId}`, SK: 'META' }
}

export function segmentSortKey(sequence: Sequence): string {
  return `SEGMENT#${sequence.toString().padStart(10, '0')}`
}

export function segmentKey(
  sessionId: SessionId,
  sequence: Sequence,
): DynamoDbKey {
  return { PK: `SESSION#${sessionId}`, SK: segmentSortKey(sequence) }
}

export function firstSegmentKey(): string {
  return segmentSortKey(0)
}

export function previousSegmentKey(sequence: Sequence): string {
  if (sequence === 0) {
    throw new Error('No sequence precedes zero')
  }
  return segmentSortKey(sequence - 1)
}
