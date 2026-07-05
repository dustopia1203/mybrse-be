import type {
  CorrelatedErrorPublication,
  DraftPublication,
  PublishResult,
  SessionConnection,
  SubtitlePublisher,
} from '../../src/ports'

export class FakeSubtitlePublisher implements SubtitlePublisher {
  readonly drafts: Array<{
    connection: SessionConnection
    publication: DraftPublication
  }> = []
  readonly errors: Array<{
    connection: SessionConnection
    publication: CorrelatedErrorPublication
  }> = []
  constructor(
    private readonly callLog: string[],
    public draftResult: PublishResult = { kind: 'published' },
    public errorResult: PublishResult = { kind: 'published' },
  ) {}
  async publishDraft(
    connection: SessionConnection,
    publication: DraftPublication,
  ): Promise<PublishResult> {
    this.callLog.push('publishDraft')
    this.drafts.push({ connection, publication })
    return this.draftResult
  }
  async publishError(
    connection: SessionConnection,
    publication: CorrelatedErrorPublication,
  ): Promise<PublishResult> {
    this.callLog.push('publishError')
    this.errors.push({ connection, publication })
    return this.errorResult
  }
}
