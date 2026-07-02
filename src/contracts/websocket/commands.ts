import { z } from 'zod'

import {
  LanguageCodeSchema,
  MediaOffsetMillisecondsSchema,
  RevisionSchema,
  SegmentIdSchema,
  SequenceSchema,
  SessionIdSchema,
} from '../../domain'

export const SessionStartCommandSchema = z.strictObject({
  action: z.literal('session.start'),
  sessionId: SessionIdSchema,
  sourceLanguage: LanguageCodeSchema,
  targetLanguage: LanguageCodeSchema,
})
export type SessionStartCommand = z.infer<typeof SessionStartCommandSchema>

export const TranscriptUpsertCommandSchema = z
  .strictObject({
    action: z.literal('transcript.upsert'),
    sessionId: SessionIdSchema,
    segmentId: SegmentIdSchema,
    sequence: SequenceSchema,
    revision: RevisionSchema,
    text: z.string(),
    isFinal: z.boolean(),
    startMs: MediaOffsetMillisecondsSchema,
    endMs: MediaOffsetMillisecondsSchema,
  })
  .refine(({ startMs, endMs }) => endMs >= startMs, {
    message: 'endMs must be greater than or equal to startMs',
    path: ['endMs'],
  })
export type TranscriptUpsertCommand = z.infer<
  typeof TranscriptUpsertCommandSchema
>

export const WebSocketCommandSchema = z.union([
  SessionStartCommandSchema,
  TranscriptUpsertCommandSchema,
])
export type WebSocketCommand = z.infer<typeof WebSocketCommandSchema>
