export interface LocalStackAwsConfig {
  endpoint: string
  region: string
  credentials: {
    accessKeyId: string
    secretAccessKey: string
  }
}

export function localStackAwsConfig(
  env: Record<string, string | undefined> = process.env,
): LocalStackAwsConfig {
  return {
    endpoint: env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566',
    region: env.LOCALSTACK_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: env.LOCALSTACK_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: env.LOCALSTACK_SECRET_ACCESS_KEY ?? 'test',
    },
  }
}

export async function waitForLocalStack(
  endpoint = localStackAwsConfig().endpoint,
): Promise<void> {
  const deadline = Date.now() + 2_000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/_localstack/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(
    `LocalStack is not reachable at ${endpoint}. Start it with pnpm localstack:up${detail}`,
  )
}
