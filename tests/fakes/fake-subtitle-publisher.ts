import type {
  CorrelatedErrorPublication,
  DraftPublication,
  PublishResult,
  RefinedPublication,
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
  readonly refined: Array<{
    connection: SessionConnection
    publication: RefinedPublication
  }> = []
  constructor(
    private readonly callLog: string[],
    public draftResult: PublishResult = { kind: 'published' },
    public errorResult: PublishResult = { kind: 'published' },
    public refinedResult: PublishResult = { kind: 'published' },
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
  async publishRefined(
    connection: SessionConnection,
    publication: RefinedPublication,
  ): Promise<PublishResult> {
    this.callLog.push('publishRefined')
    this.refined.push({ connection, publication })
    return this.refinedResult
  }
}
