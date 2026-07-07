import { describe, expect, it } from 'vitest'

import {
  createBackendRuntime,
  resetBackendRuntimeForTests,
  type BackendRuntimeFactoryDependencies,
} from '../../src/composition/runtime'

const config = {
  tableName: 'translation-state',
  refinementQueueUrl:
    'https://sqs.ap-southeast-1.amazonaws.com/123456789012/refinement',
  contextWindowSize: 5,
  draftProvider: 'amazon-translate' as const,
  refinerProvider: 'amazon-bedrock' as const,
  bedrockModelId: 'provider.model-v1',
  sessionRetentionSeconds: 86_400,
}

describe('backend runtime composition', () => {
  it('constructs use cases and reuses endpoint-specific API Gateway senders', () => {
    const createdEndpoints: string[] = []
    const dependencies: BackendRuntimeFactoryDependencies = {
      nowMs: () => 1234567890,
      createApiGatewaySender: (endpoint) => {
        createdEndpoints.push(endpoint)
        return { send: async () => ({ $metadata: {} }) }
      },
    }

    const runtime = createBackendRuntime(config, dependencies)

    expect(typeof runtime.startSession).toBe('function')
    expect(typeof runtime.disconnectSession).toBe('function')
    expect(typeof runtime.processTranscript).toBe('function')
    expect(typeof runtime.processRefinement).toBe('function')
    expect(runtime.controlPublisher).toBeDefined()

    const first = runtime.resolveApiGatewaySender('https://example.com/prod')
    const second = runtime.resolveApiGatewaySender('https://example.com/prod')
    const third = runtime.resolveApiGatewaySender(
      'https://other.example.com/prod',
    )

    expect(first).toBe(second)
    expect(third).not.toBe(first)
    expect(createdEndpoints).toEqual([
      'https://example.com/prod',
      'https://other.example.com/prod',
    ])
  })

  it('can reset module-level runtime caches for tests', () => {
    resetBackendRuntimeForTests()
    expect(() => resetBackendRuntimeForTests()).not.toThrow()
  })
})
