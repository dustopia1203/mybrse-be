import {
  SendMessageCommand,
  type SendMessageCommandOutput,
} from '@aws-sdk/client-sqs'

import type {
  EnqueueRefinementResult,
  RefinementQueue,
  SessionRevisionReference,
} from '../../../ports'
import {
  internalAdapterFailure,
  isAwsFailure,
  queueUnavailable,
} from '../errors'
import { serializeRefinementJob } from './refinement-job-serialization'

export interface SqsCommandSender {
  send(command: SendMessageCommand): Promise<SendMessageCommandOutput>
}

export class SqsRefinementQueue implements RefinementQueue {
  constructor(
    private readonly sender: SqsCommandSender,
    private readonly queueUrl: string,
  ) {}

  async enqueue(
    reference: SessionRevisionReference,
  ): Promise<EnqueueRefinementResult> {
    let messageBody: string
    try {
      messageBody = serializeRefinementJob(reference)
    } catch {
      return { kind: 'failed', error: internalAdapterFailure() }
    }

    try {
      await this.sender.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: messageBody,
        }),
      )
      return { kind: 'enqueued' }
    } catch (error) {
      return {
        kind: 'failed',
        error: isAwsFailure(error)
          ? queueUnavailable()
          : internalAdapterFailure(),
      }
    }
  }
}
