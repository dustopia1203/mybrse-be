import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SqsRefinementQueue } from '../../../src/adapters/aws/sqs/sqs-refinement-queue'
import {
  createLiveAwsClients,
  type LiveAwsClients,
} from './support/aws-clients'
import { removeExpectedQueueJob } from './support/cleanup'
import {
  loadLiveAwsIntegrationConfig,
  type LiveAwsIntegrationConfig,
} from './support/integration-config'
import {
  createTestRunRegistry,
  registerExpectedQueueJob,
  registerSegmentId,
  registerSessionId,
  type TestRunRegistry,
} from './support/test-run'

let config: LiveAwsIntegrationConfig | undefined
let clients: LiveAwsClients | undefined
let registry: TestRunRegistry | undefined

beforeAll(() => {
  config = loadLiveAwsIntegrationConfig()
  clients = createLiveAwsClients(config)
  registry = createTestRunRegistry()
})

afterAll(async () => {
  if (config === undefined || clients === undefined || registry === undefined) {
    return
  }

  let cleanupFailure: unknown
  for (const sessionId of registry.expectedQueueJobs.keys()) {
    if (registry.removedQueueSessionIds.has(sessionId)) continue
    try {
      await removeExpectedQueueJob({
        client: clients.sqs,
        queueUrl: config.refinementQueueUrl,
        registry,
        sessionId,
      })
    } catch (error) {
      cleanupFailure ??= error
    }
  }
  if (cleanupFailure !== undefined) throw cleanupFailure
})

describe('SQS refinement queue against live AWS', () => {
  it('enqueues and removes the exact current-run refinement job', async () => {
    const activeConfig = config!
    const activeClients = clients!
    const activeRegistry = registry!
    const job = {
      sessionId: registerSessionId(activeRegistry),
      segmentId: registerSegmentId(activeRegistry),
      sequence: 1,
      revision: 1,
    }
    registerExpectedQueueJob(activeRegistry, job)
    const queue = new SqsRefinementQueue(
      activeClients.sqs,
      activeConfig.refinementQueueUrl,
    )

    await expect(queue.enqueue(job)).resolves.toEqual({ kind: 'enqueued' })
    await expect(
      removeExpectedQueueJob({
        client: activeClients.sqs,
        queueUrl: activeConfig.refinementQueueUrl,
        registry: activeRegistry,
        sessionId: job.sessionId,
      }),
    ).resolves.toBe(true)
  })
})
