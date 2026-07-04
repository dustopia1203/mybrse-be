import { z } from 'zod'

import {
  LanguageCodeSchema,
  MediaOffsetMillisecondsSchema,
  RefinementStatusSchema,
  RevisionSchema,
  SegmentIdSchema,
  SequenceSchema,
  SessionIdSchema,
  SessionSchema,
  UnixTimeMillisecondsSchema,
  UnixTimeSecondsSchema,
  type Segment,
  type Session,
} from '../../../domain'
import type { SessionConnection, StoredSession } from '../../../ports'
import { connectionKey, segmentKey, sessionKey } from './keys'

const ConnectionIdSchema = z.string().trim().min(1)

export const SessionItemSchema = z
  .strictObject({
    PK: z.string(),
    SK: z.literal('META'),
    entityType: z.literal('SESSION'),
    sessionId: SessionIdSchema,
    sourceLanguage: LanguageCodeSchema,
    targetLanguage: LanguageCodeSchema,
    createdAtMs: UnixTimeMillisecondsSchema,
    expiresAt: UnixTimeSecondsSchema,
    connectionId: ConnectionIdSchema.optional(),
    callbackEndpoint: z.url().optional(),
  })
  .superRefine((item, context) => {
    if (
      (item.connectionId === undefined) !==
      (item.callbackEndpoint === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'connectionId and callbackEndpoint must appear together',
      })
    }
  })
export type SessionItem = z.infer<typeof SessionItemSchema>

export const SegmentItemSchema = z
  .strictObject({
    PK: z.string(),
    SK: z.string(),
    entityType: z.literal('SEGMENT'),
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
    expiresAt: UnixTimeSecondsSchema,
  })
  .refine(({ startMs, endMs }) => endMs >= startMs, {
    message: 'endMs must be greater than or equal to startMs',
    path: ['endMs'],
  })
export type SegmentItem = z.infer<typeof SegmentItemSchema>

export const ConnectionItemSchema = z.strictObject({
  PK: z.string(),
  SK: z.literal('META'),
  entityType: z.literal('CONNECTION'),
  connectionId: ConnectionIdSchema,
  sessionId: SessionIdSchema,
  expiresAt: UnixTimeSecondsSchema,
})
export type ConnectionItem = z.infer<typeof ConnectionItemSchema>

export function sessionItem(
  session: Session,
  connection?: SessionConnection,
): SessionItem {
  return SessionItemSchema.parse({
    ...sessionKey(session.sessionId),
    entityType: 'SESSION',
    ...session,
    ...(connection ?? {}),
  })
}

export function sessionFromItem(item: SessionItem): StoredSession {
  const session = SessionSchema.parse({
    sessionId: item.sessionId,
    sourceLanguage: item.sourceLanguage,
    targetLanguage: item.targetLanguage,
    createdAtMs: item.createdAtMs,
    expiresAt: item.expiresAt,
  })
  return item.connectionId === undefined
    ? { session }
    : {
        session,
        connection: {
          connectionId: item.connectionId,
          callbackEndpoint: item.callbackEndpoint!,
        },
      }
}

export function segmentFromItem(item: SegmentItem): Segment {
  const {
    PK: _PK,
    SK: _SK,
    entityType: _entityType,
    expiresAt: _expiresAt,
    ...segment
  } = item
  return segment
}

export function connectionItem(
  connectionId: string,
  sessionId: z.infer<typeof SessionIdSchema>,
  expiresAt: z.infer<typeof UnixTimeSecondsSchema>,
): ConnectionItem {
  return ConnectionItemSchema.parse({
    ...connectionKey(connectionId),
    entityType: 'CONNECTION',
    connectionId,
    sessionId,
    expiresAt,
  })
}

export function segmentPersistenceKey(
  sessionId: z.infer<typeof SessionIdSchema>,
  sequence: z.infer<typeof SequenceSchema>,
) {
  return segmentKey(sessionId, sequence)
}
