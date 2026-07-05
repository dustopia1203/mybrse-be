import { z } from 'zod'

import {
  RevisionSchema,
  SegmentIdSchema,
  SequenceSchema,
  SessionIdSchema,
} from '../../domain'

export const RefinementJobSchema = z.strictObject({
  sessionId: SessionIdSchema,
  segmentId: SegmentIdSchema,
  sequence: SequenceSchema,
  revision: RevisionSchema,
})

export type RefinementJob = z.infer<typeof RefinementJobSchema>
