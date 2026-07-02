import { z } from 'zod'

import { RevisionSchema } from './scalars'

export const RevisionAcceptanceResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('accepted'),
      revision: RevisionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('stale'),
      submittedRevision: RevisionSchema,
      currentRevision: RevisionSchema,
    })
    .strict(),
])
export type RevisionAcceptanceResult = z.infer<
  typeof RevisionAcceptanceResultSchema
>

export const CurrentRevisionResultSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('current'),
      revision: RevisionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('not_current'),
      attemptedRevision: RevisionSchema,
      currentRevision: RevisionSchema.optional(),
    })
    .strict(),
])
export type CurrentRevisionResult = z.infer<typeof CurrentRevisionResultSchema>
