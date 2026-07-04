import { describe, expect, it } from 'vitest'

import {
  connectionKey,
  firstSegmentKey,
  previousSegmentKey,
  segmentKey,
  sessionKey,
} from '../../../../src/adapters/aws/dynamodb/keys'
import { SESSION_ID } from '../../../fixtures/ids'

describe('DynamoDB keys', () => {
  it('builds direct session and connection keys', () => {
    expect(sessionKey(SESSION_ID)).toEqual({
      PK: `SESSION#${SESSION_ID}`,
      SK: 'META',
    })
    expect(connectionKey('connection-1')).toEqual({
      PK: 'CONNECTION#connection-1',
      SK: 'META',
    })
  })

  it('pads segment sequence to ten digits', () => {
    expect(segmentKey(SESSION_ID, 10)).toEqual({
      PK: `SESSION#${SESSION_ID}`,
      SK: 'SEGMENT#0000000010',
    })
    expect(firstSegmentKey()).toBe('SEGMENT#0000000000')
    expect(previousSegmentKey(10)).toBe('SEGMENT#0000000009')
  })

  it('rejects a previous key before sequence zero', () => {
    expect(() => previousSegmentKey(0)).toThrow('No sequence precedes zero')
  })
})
