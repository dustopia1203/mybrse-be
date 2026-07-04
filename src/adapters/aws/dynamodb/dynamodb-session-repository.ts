import type {
  SessionLifecycleRepository,
  SessionStateRepository,
} from '../../../ports'
import type { RepositoryDependencies } from './client'
import { createContextOperations } from './context'
import { createLifecycleOperations } from './lifecycle'
import { createSegmentOperations } from './segments'

export type DynamoDbSessionRepository = SessionLifecycleRepository &
  SessionStateRepository

export function createDynamoDbSessionRepository(
  dependencies: RepositoryDependencies,
): DynamoDbSessionRepository {
  return {
    ...createLifecycleOperations(dependencies),
    ...createSegmentOperations(dependencies),
    ...createContextOperations(dependencies),
  }
}
