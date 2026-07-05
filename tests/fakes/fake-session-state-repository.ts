import type {
  AcceptTranscriptRevisionResult,
  GetPreviousFinalSegmentsResult,
  GetSegmentResult,
  GetSessionResult,
  MarkRefinementQueuedResult,
  SaveDraftResult,
  SaveRefinedResult,
  SessionRevisionReference,
  SessionStateRepository,
  TranscriptRevisionInput,
} from '../../src/ports'

export class FakeSessionStateRepository implements SessionStateRepository {
  readonly acceptedInputs: TranscriptRevisionInput[] = []
  readonly draftInputs: Parameters<SessionStateRepository['saveDraft']>[0][] =
    []
  readonly queuedReferences: SessionRevisionReference[] = []
  constructor(
    private readonly callLog: string[],
    public getSessionResult: GetSessionResult,
    public acceptResult: AcceptTranscriptRevisionResult,
    public saveDraftResult: SaveDraftResult,
    public markQueuedResult: MarkRefinementQueuedResult = { kind: 'queued' },
  ) {}
  async getSession(): Promise<GetSessionResult> {
    this.callLog.push('getSession')
    return this.getSessionResult
  }
  async acceptTranscriptRevision(
    input: TranscriptRevisionInput,
  ): Promise<AcceptTranscriptRevisionResult> {
    this.callLog.push('accept')
    this.acceptedInputs.push(input)
    return this.acceptResult
  }
  async saveDraft(
    input: Parameters<SessionStateRepository['saveDraft']>[0],
  ): Promise<SaveDraftResult> {
    this.callLog.push('saveDraft')
    this.draftInputs.push(input)
    return this.saveDraftResult
  }
  async markRefinementQueued(
    reference: SessionRevisionReference,
  ): Promise<MarkRefinementQueuedResult> {
    this.callLog.push('markQueued')
    this.queuedReferences.push(reference)
    return this.markQueuedResult
  }
  async getSegment(): Promise<GetSegmentResult> {
    throw new Error('ProcessTranscript must not call getSegment')
  }
  async saveRefined(): Promise<SaveRefinedResult> {
    throw new Error('ProcessTranscript must not call saveRefined')
  }
  async getPreviousFinalSegments(): Promise<GetPreviousFinalSegmentsResult> {
    throw new Error('ProcessTranscript must not query refinement context')
  }
}
