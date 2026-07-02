import { z } from 'zod'

const TrimmedNonEmptyStringSchema = z.string().trim().min(1)
const PositiveSafeIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)

export const BackendConfigSchema = z.strictObject({
  tableName: TrimmedNonEmptyStringSchema,
  refinementQueueUrl: z.string().url(),
  contextWindowSize: PositiveSafeIntegerSchema.default(5),
  draftProvider: TrimmedNonEmptyStringSchema,
  refinerProvider: TrimmedNonEmptyStringSchema,
  bedrockModelId: TrimmedNonEmptyStringSchema,
  sessionRetentionSeconds: PositiveSafeIntegerSchema.default(86_400),
})

export type BackendConfig = z.infer<typeof BackendConfigSchema>
