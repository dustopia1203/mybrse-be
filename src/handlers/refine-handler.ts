import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSRecord,
} from 'aws-lambda'

import { getBackendRuntime, type BackendRuntime } from '../composition'
import { RefinementJobSchema } from '../contracts'
import { logError, logInfo, logWarn } from './logging'

export type RefineRuntime = Pick<BackendRuntime, 'processRefinement'>
export type RefineRuntimeResolver =
  () => RefineRuntime | Promise<RefineRuntime>

function parseRecord(record: SQSRecord):
  | { kind: 'parsed'; job: Parameters<RefineRuntime['processRefinement']>[0] }
  | { kind: 'invalid' } {
  try {
    const parsed = RefinementJobSchema.safeParse(JSON.parse(record.body))
    return parsed.success
      ? { kind: 'parsed', job: parsed.data }
      : { kind: 'invalid' }
  } catch {
    return { kind: 'invalid' }
  }
}

export const createRefineHandler =
  (getRuntime: RefineRuntimeResolver) =>
  async (event: SQSEvent): Promise<SQSBatchResponse> => {
    let runtime: RefineRuntime
    try {
      runtime = await getRuntime()
    } catch (error) {
      logError({
        handler: 'refine',
        outcome: 'configuration_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      return {
        batchItemFailures: event.Records.map((record) => ({
          itemIdentifier: record.messageId,
        })),
      }
    }

    const batchItemFailures: SQSBatchItemFailure[] = []

    for (const record of event.Records) {
      const parsed = parseRecord(record)
      if (parsed.kind === 'invalid') {
        logWarn({
          handler: 'refine',
          messageId: record.messageId,
          outcome: 'invalid_job',
        })
        continue
      }

      try {
        const result = await runtime.processRefinement(parsed.job)
        logInfo({
          handler: 'refine',
          messageId: record.messageId,
          sessionId: parsed.job.sessionId,
          segmentId: parsed.job.segmentId,
          sequence: parsed.job.sequence,
          revision: parsed.job.revision,
          outcome: result.kind,
          ...(result.kind === 'failed'
            ? { errorCode: result.error.code }
            : {}),
        })
        if (result.kind === 'failed') {
          batchItemFailures.push({ itemIdentifier: record.messageId })
        }
      } catch (error) {
        logError({
          handler: 'refine',
          messageId: record.messageId,
          sessionId: parsed.job.sessionId,
          segmentId: parsed.job.segmentId,
          sequence: parsed.job.sequence,
          revision: parsed.job.revision,
          outcome: 'unexpected_exception',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        })
        batchItemFailures.push({ itemIdentifier: record.messageId })
      }
    }

    return { batchItemFailures }
  }

export const handler = createRefineHandler(getBackendRuntime)
