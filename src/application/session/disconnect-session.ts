import type {
  DetachByConnectionIdResult,
  SessionLifecycleRepository,
} from '../../ports'

export interface DisconnectSessionInput {
  connectionId: string
}

export type DisconnectSessionResult = DetachByConnectionIdResult

export interface DisconnectSessionDependencies {
  repository: SessionLifecycleRepository
}

export const createDisconnectSession =
  ({ repository }: DisconnectSessionDependencies) =>
  async (input: DisconnectSessionInput): Promise<DisconnectSessionResult> =>
    repository.detachByConnectionId(input.connectionId)
