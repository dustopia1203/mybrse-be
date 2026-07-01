import { z } from 'zod'

import { SegmentIdSchema, SequenceSchema } from './scalars'

export const TranslationKindSchema = z.enum(['draft', 'refined'])
export type TranslationKind = z.infer<typeof TranslationKindSchema>

export const TranslationContextEntrySchema = z.strictObject({
  segmentId: SegmentIdSchema,
  sequence: SequenceSchema,
  sourceText: z.string(),
  translatedText: z.string(),
  translationKind: TranslationKindSchema,
})

export type TranslationContextEntry = z.infer<
  typeof TranslationContextEntrySchema
>

export const TranslationContextSchema = z.array(TranslationContextEntrySchema)
export type TranslationContext = z.infer<typeof TranslationContextSchema>
