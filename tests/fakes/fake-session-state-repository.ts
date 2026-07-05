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
  readonly segmentReferences: SessionRevisionReference[] = []
  readonly refinedInputs: Parameters<
    SessionStateRepository['saveRefined']
  >[0][] = []
  readonly contextInputs: Parameters<
    SessionStateRepository['getPreviousFinalSegments']
  >[0][] = []
  getSegmentResult?: GetSegmentResult
  saveRefinedResult?: SaveRefinedResult
  getContextResult?: GetPreviousFinalSegmentsResult
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
  async getSegment(
    reference: SessionRevisionReference,
  ): Promise<GetSegmentResult> {
    this.callLog.push('getSegment')
    this.segmentReferences.push(reference)
    if (!this.getSegmentResult)
      throw new Error('getSegment result was not configured')
    return this.getSegmentResult
  }
  async saveRefined(
    input: Parameters<SessionStateRepository['saveRefined']>[0],
  ): Promise<SaveRefinedResult> {
    this.callLog.push('saveRefined')
    this.refinedInputs.push(input)
    if (!this.saveRefinedResult)
      throw new Error('saveRefined result was not configured')
    return this.saveRefinedResult
  }
  async getPreviousFinalSegments(
    input: Parameters<
      SessionStateRepository['getPreviousFinalSegments']
    >[0],
  ): Promise<GetPreviousFinalSegmentsResult> {
    this.callLog.push('getContext')
    this.contextInputs.push(input)
    if (!this.getContextResult)
      throw new Error('context result was not configured')
    return this.getContextResult
  }
}
