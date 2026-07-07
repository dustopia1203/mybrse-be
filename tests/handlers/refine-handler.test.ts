import type { SQSEvent } from 'aws-lambda'
import { describe, expect, it } from 'vitest'

import { createRefineHandler } from '../../src/handlers/refine-handler'

const validReference = {
  sessionId: '0192f3a0-7b5c-7c8d-8e9f-0123456789ab',
  segmentId: '0192f3a0-7b5e-7abc-9def-0123456789ab',
  sequence: 10,
  revision: 4,
}

function event(body: string, messageId = 'message-1'): SQSEvent {
  return {
    Records: [
      {
        messageId,
        receiptHandle: 'receipt',
        body,
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: 'md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:ap-southeast-1:123456789012:refinement',
        awsRegion: 'ap-southeast-1',
      },
    ],
  }
}

describe('refine handler', () => {
  it('acknowledges completed and acknowledged refinement outcomes', async () => {
    const calls: unknown[] = []
    const handler = createRefineHandler(
      () =>
        ({
          processRefinement: async (reference: typeof validReference) => {
            calls.push(reference)
            return { kind: 'completed', reference }
          },
        }) as never,
    )

    await expect(
      handler(event(JSON.stringify(validReference))),
    ).resolves.toEqual({
      batchItemFailures: [],
    })
    expect(calls).toEqual([validReference])
  })

  it('returns message IDs for retryable application failures', async () => {
    const handler = createRefineHandler(
      () =>
        ({
          processRefinement: async (reference: typeof validReference) => ({
            kind: 'failed',
            disposition: 'retry',
            reference,
            error: {
              code: 'PROVIDER_UNAVAILABLE',
              message: 'safe',
              retryable: true,
            },
          }),
        }) as never,
    )

    await expect(
      handler(event(JSON.stringify(validReference), 'retry-me')),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'retry-me' }],
    })
  })

  it('acknowledges invalid JSON and invalid schema as terminal messages', async () => {
    let calls = 0
    const handler = createRefineHandler(
      () =>
        ({
          processRefinement: async () => {
            calls += 1
            return { kind: 'completed', reference: validReference }
          },
        }) as never,
    )

    await expect(handler(event('{bad json'))).resolves.toEqual({
      batchItemFailures: [],
    })
    await expect(
      handler(event(JSON.stringify({ sequence: -1 }))),
    ).resolves.toEqual({
      batchItemFailures: [],
    })
    expect(calls).toBe(0)
  })

  it('retries every record when runtime composition fails', async () => {
    const handler = createRefineHandler(() => {
      throw new Error('config failed')
    })

    await expect(
      handler(event(JSON.stringify(validReference), 'config-fail')),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'config-fail' }],
    })
  })
})
