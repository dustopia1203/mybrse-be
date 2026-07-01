import { z } from 'zod'

import {
  MediaOffsetMillisecondsSchema,
  RevisionSchema,
  SegmentIdSchema,
  SequenceSchema,
  SessionIdSchema,
} from './scalars'

export const RefinementStatusSchema = z.enum(['PENDING', 'QUEUED', 'COMPLETED'])
export type RefinementStatus = z.infer<typeof RefinementStatusSchema>

export const SegmentSchema = z
  .strictObject({
    sessionId: SessionIdSchema,
    segmentId: SegmentIdSchema,
    sequence: SequenceSchema,
    revision: RevisionSchema,
    sourceText: z.string(),
    isFinal: z.boolean(),
    startMs: MediaOffsetMillisecondsSchema,
    endMs: MediaOffsetMillisecondsSchema,
    draftText: z.string().optional(),
    refinedText: z.string().optional(),
    refinementStatus: RefinementStatusSchema.optional(),
  })
  .refine(({ startMs, endMs }) => endMs >= startMs, {
    message: 'endMs must be greater than or equal to startMs',
    path: ['endMs'],
  })

export type Segment = z.infer<typeof SegmentSchema>
