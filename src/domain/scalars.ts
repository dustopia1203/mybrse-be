import { z } from 'zod'

const TrimmedNonEmptyStringSchema = z.string().trim().min(1)
const NonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)

export const LanguageCodeSchema = TrimmedNonEmptyStringSchema
export type LanguageCode = z.infer<typeof LanguageCodeSchema>

export const SessionIdSchema = TrimmedNonEmptyStringSchema
export type SessionId = z.infer<typeof SessionIdSchema>

export const SegmentIdSchema = TrimmedNonEmptyStringSchema
export type SegmentId = z.infer<typeof SegmentIdSchema>

export const SequenceSchema = NonNegativeSafeIntegerSchema
export type Sequence = z.infer<typeof SequenceSchema>

export const RevisionSchema = NonNegativeSafeIntegerSchema
export type Revision = z.infer<typeof RevisionSchema>

export const UnixTimeMillisecondsSchema = NonNegativeSafeIntegerSchema
export type UnixTimeMilliseconds = z.infer<typeof UnixTimeMillisecondsSchema>

export const UnixTimeSecondsSchema = NonNegativeSafeIntegerSchema
export type UnixTimeSeconds = z.infer<typeof UnixTimeSecondsSchema>

export const MediaOffsetMillisecondsSchema = NonNegativeSafeIntegerSchema
export type MediaOffsetMilliseconds = z.infer<
  typeof MediaOffsetMillisecondsSchema
>
