import type { ApplicationError } from '../../domain'
import type {
  CorrelatedErrorPublication,
  SessionConnection,
  SubtitlePublisher,
} from '../../ports'

export type ReportErrorResult =
  { kind: 'reported' } | { kind: 'failed'; error: ApplicationError }

export const reportCorrelatedError = async (input: {
  publisher: SubtitlePublisher
  connection: SessionConnection
  publication: CorrelatedErrorPublication
}): Promise<ReportErrorResult> => {
  const result = await input.publisher.publishError(
    input.connection,
    input.publication,
  )
  return result.kind === 'published'
    ? { kind: 'reported' }
    : { kind: 'failed', error: result.error }
}
