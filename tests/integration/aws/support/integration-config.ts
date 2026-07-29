import { z } from 'zod'

const REQUIRED_NAMES = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_INTEGRATION_TABLE_NAME',
  'AWS_INTEGRATION_REFINEMENT_QUEUE_URL',
  'AWS_INTEGRATION_BEDROCK_MODEL_ID',
] as const

const NonEmpty = z.string().trim().min(1)

export interface LiveAwsIntegrationConfig {
  region: string
  credentials: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken?: string
  }
  tableName: string
  refinementQueueUrl: string
  bedrockModelId: string
}

export class IntegrationConfigError extends Error {
  constructor(readonly variableNames: readonly string[]) {
    super(`Missing or invalid live-AWS variables: ${variableNames.join(', ')}`)
    this.name = 'IntegrationConfigError'
  }
}

export function loadLiveAwsIntegrationConfig(
  env: Record<string, string | undefined> = process.env,
): LiveAwsIntegrationConfig {
  const missing = REQUIRED_NAMES.filter(
    (name) => !NonEmpty.safeParse(env[name]).success,
  )
  if (missing.length > 0) throw new IntegrationConfigError(missing)

  const queueUrl = z.url().safeParse(env.AWS_INTEGRATION_REFINEMENT_QUEUE_URL)
  if (!queueUrl.success) {
    throw new IntegrationConfigError(['AWS_INTEGRATION_REFINEMENT_QUEUE_URL'])
  }
  const sessionToken = NonEmpty.safeParse(env.AWS_SESSION_TOKEN)
  return {
    region: env.AWS_REGION!.trim(),
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!.trim(),
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!.trim(),
      ...(sessionToken.success ? { sessionToken: sessionToken.data } : {}),
    },
    tableName: env.AWS_INTEGRATION_TABLE_NAME!.trim(),
    refinementQueueUrl: queueUrl.data,
    bedrockModelId: env.AWS_INTEGRATION_BEDROCK_MODEL_ID!.trim(),
  }
}
