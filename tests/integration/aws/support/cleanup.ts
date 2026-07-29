import {
  RefinementJobSchema,
  type RefinementJob,
} from '../../../../src/contracts'

import type { TestRunRegistry } from './test-run'

const UNOWNED_DYNAMO_KEY_MESSAGE = 'Refusing to delete an unowned DynamoDB key'

export function assertOwnedDynamoKey(
  registry: TestRunRegistry,
  key: { PK: string; SK: string },
): void {
  const sessionId = key.PK.startsWith('SESSION#')
    ? key.PK.slice('SESSION#'.length)
    : undefined
  const connectionId = key.PK.startsWith('CONNECTION#')
    ? key.PK.slice('CONNECTION#'.length)
    : undefined

  if (
    key.SK.length > 0 &&
    ((sessionId !== undefined && registry.sessionIds.has(sessionId)) ||
      (connectionId !== undefined && registry.connectionIds.has(connectionId)))
  ) {
    return
  }

  throw new Error(UNOWNED_DYNAMO_KEY_MESSAGE)
}

export function ownedQueueJob(
  registry: TestRunRegistry,
  body: string | undefined,
): RefinementJob | undefined {
  try {
    const parsedJob = RefinementJobSchema.safeParse(JSON.parse(body ?? ''))
    if (!parsedJob.success) return undefined

    const expectedJob = registry.expectedQueueJobs.get(parsedJob.data.sessionId)
    if (
      expectedJob === undefined ||
      expectedJob.segmentId !== parsedJob.data.segmentId ||
      expectedJob.sequence !== parsedJob.data.sequence ||
      expectedJob.revision !== parsedJob.data.revision
    ) {
      return undefined
    }

    return parsedJob.data
  } catch {
    return undefined
  }
}
