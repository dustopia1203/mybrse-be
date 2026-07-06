import { RefinementJobSchema } from '../../../contracts'
import type { SessionRevisionReference } from '../../../ports'

export function serializeRefinementJob(
  reference: SessionRevisionReference,
): string {
  return JSON.stringify(RefinementJobSchema.parse(reference))
}
