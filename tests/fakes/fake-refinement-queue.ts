import type {
  EnqueueRefinementResult,
  RefinementQueue,
  SessionRevisionReference,
} from '../../src/ports'

export class FakeRefinementQueue implements RefinementQueue {
  readonly references: SessionRevisionReference[] = []
  constructor(
    private readonly callLog: string[],
    public result: EnqueueRefinementResult = { kind: 'enqueued' },
  ) {}
  async enqueue(
    reference: SessionRevisionReference,
  ): Promise<EnqueueRefinementResult> {
    this.callLog.push('enqueue')
    this.references.push(reference)
    return this.result
  }
}
