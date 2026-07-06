import {
  SendMessageCommand,
  type SendMessageCommandOutput,
} from '@aws-sdk/client-sqs'
import { describe, expect, it } from 'vitest'

import {
  SqsRefinementQueue,
  type SqsCommandSender,
} from '../../../../src/adapters/aws/sqs'
import { RefinementJobSchema } from '../../../../src/contracts'
import type { RefinementQueue } from '../../../../src/ports'
import { SEGMENT_ID, SESSION_ID } from '../../../fixtures/ids'

const REFERENCE = {
  sessionId: SESSION_ID,
  segmentId: SEGMENT_ID,
  sequence: 10,
  revision: 4,
}

class ScriptedSender implements SqsCommandSender {
  command?: SendMessageCommand
  constructor(private readonly thrown?: unknown) {}
  async send(command: SendMessageCommand): Promise<SendMessageCommandOutput> {
    this.command = command
    if (this.thrown !== undefined) throw this.thrown
    return {} as SendMessageCommandOutput
  }
}

describe('SqsRefinementQueue', () => {
  it('sends only the canonical logical refinement job', async () => {
    const sender = new ScriptedSender()
    const queue: RefinementQueue = new SqsRefinementQueue(
      sender,
      'https://sqs.ap-southeast-1.amazonaws.com/123/queue',
    )
    await expect(queue.enqueue(REFERENCE)).resolves.toEqual({
      kind: 'enqueued',
    })
    expect(sender.command?.input.QueueUrl).toContain('/queue')
    const body = JSON.parse(sender.command?.input.MessageBody ?? '')
    expect(RefinementJobSchema.parse(body)).toEqual(REFERENCE)
    expect(sender.command?.input).toEqual({
      QueueUrl: 'https://sqs.ap-southeast-1.amazonaws.com/123/queue',
      MessageBody: JSON.stringify(REFERENCE),
    })
  })

  it('rejects invalid local input before sending', async () => {
    const sender = new ScriptedSender()
    const queue = new SqsRefinementQueue(sender, 'https://example.com/queue')
    await expect(
      queue.enqueue({ ...REFERENCE, sequence: -1 } as never),
    ).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    })
    expect(sender.command).toBeUndefined()
  })

  it('normalizes an SDK send failure', async () => {
    const queue = new SqsRefinementQueue(
      new ScriptedSender({
        name: 'ServiceUnavailableException',
        $fault: 'server',
      }),
      'https://example.com/queue',
    )
    await expect(queue.enqueue(REFERENCE)).resolves.toMatchObject({
      kind: 'failed',
      error: { code: 'QUEUE_UNAVAILABLE' },
    })
  })
})
