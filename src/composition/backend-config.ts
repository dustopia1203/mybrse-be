import { z } from 'zod'

const TrimmedNonEmptyStringSchema = z.string().trim().min(1)
const PositiveSafeIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)

export const DraftProviderSchema = z.literal('amazon-translate')
export type DraftProvider = z.infer<typeof DraftProviderSchema>

export const RefinerProviderSchema = z.literal('amazon-bedrock')
export type RefinerProvider = z.infer<typeof RefinerProviderSchema>

export const BackendConfigSchema = z.strictObject({
  tableName: TrimmedNonEmptyStringSchema,
  refinementQueueUrl: z.string().url(),
  contextWindowSize: PositiveSafeIntegerSchema.default(5),
  draftProvider: DraftProviderSchema,
  refinerProvider: RefinerProviderSchema,
  bedrockModelId: TrimmedNonEmptyStringSchema,
  sessionRetentionSeconds: PositiveSafeIntegerSchema.default(86_400),
})

export type BackendConfig = z.infer<typeof BackendConfigSchema>

type BackendEnvironment = Record<string, string | undefined>

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function loadBackendConfig(env: BackendEnvironment): BackendConfig {
  return BackendConfigSchema.parse({
    tableName: env.TABLE_NAME,
    refinementQueueUrl: env.REFINEMENT_QUEUE_URL,
    draftProvider: env.DRAFT_PROVIDER,
    refinerProvider: env.REFINER_PROVIDER,
    bedrockModelId: env.BEDROCK_MODEL_ID,
    contextWindowSize: optionalNumber(env.CONTEXT_WINDOW_SIZE),
    sessionRetentionSeconds: optionalNumber(env.SESSION_RETENTION_SECONDS),
  })
}
