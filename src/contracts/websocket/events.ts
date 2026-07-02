import { z } from 'zod'

import {
  APPLICATION_ERROR_RETRYABILITY,
  ApplicationErrorCodeSchema,
  RevisionSchema,
  SegmentIdSchema,
  SequenceSchema,
  SessionIdSchema,
} from '../../domain'

export const SessionStartedEventSchema = z.strictObject({
  type: z.literal('session.started'),
  sessionId: SessionIdSchema,
})
export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>

export const SubtitleDraftEventSchema = z.strictObject({
  type: z.literal('subtitle.draft'),
  sessionId: SessionIdSchema,
  segmentId: SegmentIdSchema,
  sequence: SequenceSchema,
  revision: RevisionSchema,
  text: z.string(),
  isFinal: z.boolean(),
})
export type SubtitleDraftEvent = z.infer<typeof SubtitleDraftEventSchema>

export const SubtitleRefinedEventSchema = z.strictObject({
  type: z.literal('subtitle.refined'),
  sessionId: SessionIdSchema,
  segmentId: SegmentIdSchema,
  sequence: SequenceSchema,
  revision: RevisionSchema,
  text: z.string(),
  isFinal: z.literal(true),
})
export type SubtitleRefinedEvent = z.infer<typeof SubtitleRefinedEventSchema>

const translationErrorBaseShape = {
  type: z.literal('translation.error'),
  code: ApplicationErrorCodeSchema,
  retryable: z.boolean(),
}

export const ContractTranslationErrorEventSchema = z.strictObject({
  ...translationErrorBaseShape,
  stage: z.literal('contract'),
})
export type ContractTranslationErrorEvent = z.infer<
  typeof ContractTranslationErrorEventSchema
>

export const SessionTranslationErrorEventSchema = z.strictObject({
  ...translationErrorBaseShape,
  stage: z.literal('session'),
  sessionId: SessionIdSchema,
})
export type SessionTranslationErrorEvent = z.infer<
  typeof SessionTranslationErrorEventSchema
>

const correlatedTranslationErrorShape = {
  ...translationErrorBaseShape,
  sessionId: SessionIdSchema,
  segmentId: SegmentIdSchema,
  revision: RevisionSchema,
}

export const DraftTranslationErrorEventSchema = z.strictObject({
  ...correlatedTranslationErrorShape,
  stage: z.literal('draft'),
})
export type DraftTranslationErrorEvent = z.infer<
  typeof DraftTranslationErrorEventSchema
>

export const RefinementQueueTranslationErrorEventSchema = z.strictObject({
  ...correlatedTranslationErrorShape,
  stage: z.literal('refinement_queue'),
})
export type RefinementQueueTranslationErrorEvent = z.infer<
  typeof RefinementQueueTranslationErrorEventSchema
>

export const RefinementTranslationErrorEventSchema = z.strictObject({
  ...correlatedTranslationErrorShape,
  stage: z.literal('refinement'),
})
export type RefinementTranslationErrorEvent = z.infer<
  typeof RefinementTranslationErrorEventSchema
>

export const TranslationErrorEventSchema = z
  .discriminatedUnion('stage', [
    ContractTranslationErrorEventSchema,
    SessionTranslationErrorEventSchema,
    DraftTranslationErrorEventSchema,
    RefinementQueueTranslationErrorEventSchema,
    RefinementTranslationErrorEventSchema,
  ])
  .superRefine((event, context) => {
    if (event.retryable !== APPLICATION_ERROR_RETRYABILITY[event.code]) {
      context.addIssue({
        code: 'custom',
        message: 'retryable must match the application error code',
        path: ['retryable'],
      })
    }
  })
export type TranslationErrorEvent = z.infer<typeof TranslationErrorEventSchema>

export const WebSocketOutboundEventSchema = z.union([
  SessionStartedEventSchema,
  SubtitleDraftEventSchema,
  SubtitleRefinedEventSchema,
  TranslationErrorEventSchema,
])
export type WebSocketOutboundEvent = z.infer<
  typeof WebSocketOutboundEventSchema
>
