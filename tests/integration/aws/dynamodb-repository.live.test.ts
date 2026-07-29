import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createDynamoDbSessionRepository,
  type DynamoDbSessionRepository,
} from '../../../src/adapters/aws/dynamodb/dynamodb-session-repository'
import type { SessionId } from '../../../src/domain'
import {
  createLiveAwsClients,
  type LiveAwsClients,
} from './support/aws-clients'
import { cleanupOwnedDynamoDbItems } from './support/cleanup'
import { loadLiveAwsIntegrationConfig } from './support/integration-config'
import {
  createTestRunRegistry,
  registerConnectionId,
  registerSegmentId,
  registerSessionId,
  type TestRunRegistry,
} from './support/test-run'
import type { LiveAwsIntegrationConfig } from './support/integration-config'

let config: LiveAwsIntegrationConfig | undefined
let clients: LiveAwsClients | undefined
let registry: TestRunRegistry | undefined
let repository: DynamoDbSessionRepository | undefined

function liveRepository(): DynamoDbSessionRepository {
  if (repository === undefined) {
    throw new Error('Live repository was not initialized')
  }
  return repository
}

function session(sessionId: SessionId) {
  return {
    sessionId,
    sourceLanguage: 'ja',
    targetLanguage: 'vi',
    createdAtMs: Date.now(),
    expiresAt: Math.floor(Date.now() / 1000) + 3_600,
  }
}

function connection(connectionId: string) {
  return {
    connectionId,
    callbackEndpoint: `https://example.com/${connectionId}`,
  }
}

beforeAll(() => {
  config = loadLiveAwsIntegrationConfig()
  clients = createLiveAwsClients(config)
  registry = createTestRunRegistry()
  repository = createDynamoDbSessionRepository({
    client: clients.dynamoDb,
    tableName: config.tableName,
  })
})

afterAll(async () => {
  if (config === undefined || clients === undefined || registry === undefined) {
    return
  }
  await cleanupOwnedDynamoDbItems({
    client: clients.dynamoDb,
    tableName: config.tableName,
    registry,
  })
})

describe('DynamoDB session repository against live AWS', () => {
  it('reattaches a session and leaves the newer connection active', async () => {
    const activeRegistry = registry!
    const activeRepository = liveRepository()
    const sessionId = registerSessionId(activeRegistry)
    const connectionA = registerConnectionId(activeRegistry, 'lifecycle-a')
    const connectionB = registerConnectionId(activeRegistry, 'lifecycle-b')
    const value = session(sessionId)

    await expect(
      activeRepository.startOrReattach({
        session: value,
        connection: connection(connectionA),
      }),
    ).resolves.toEqual({ kind: 'created' })
    await expect(
      activeRepository.startOrReattach({
        session: value,
        connection: connection(connectionB),
      }),
    ).resolves.toEqual({ kind: 'reattached' })
    await expect(
      activeRepository.detachByConnectionId(connectionA),
    ).resolves.toEqual({ kind: 'superseded' })
    await expect(activeRepository.getSession(sessionId)).resolves.toMatchObject(
      {
        kind: 'found',
        value: { connection: { connectionId: connectionB } },
      },
    )
  })

  it('preserves the current revision through stale and duplicate refinement writes', async () => {
    const activeRegistry = registry!
    const activeRepository = liveRepository()
    const sessionId = registerSessionId(activeRegistry)
    const connectionId = registerConnectionId(activeRegistry, 'revisions')
    const segmentId = registerSegmentId(activeRegistry)
    const value = session(sessionId)
    const current = {
      sessionId,
      segmentId,
      sequence: 10,
      revision: 2,
      sourceText: 'source-1',
      isFinal: true,
      startMs: 0,
      endMs: 100,
    }
    const previous = { ...current, revision: 1 }

    await expect(
      activeRepository.startOrReattach({
        session: value,
        connection: connection(connectionId),
      }),
    ).resolves.toEqual({ kind: 'created' })
    await expect(
      activeRepository.acceptTranscriptRevision(current),
    ).resolves.toEqual({ kind: 'accepted', revision: 2 })
    await expect(
      activeRepository.acceptTranscriptRevision(previous),
    ).resolves.toEqual({
      kind: 'stale',
      submittedRevision: 1,
      currentRevision: 2,
    })
    await expect(
      activeRepository.saveDraft({
        reference: current,
        isFinal: true,
        draftText: 'draft-1',
      }),
    ).resolves.toMatchObject({
      kind: 'stored',
      segment: { refinementStatus: 'PENDING' },
    })
    await expect(
      activeRepository.saveDraft({
        reference: previous,
        isFinal: true,
        draftText: 'draft-1',
      }),
    ).resolves.toMatchObject({ kind: 'not_current' })
    await expect(
      activeRepository.markRefinementQueued(current),
    ).resolves.toEqual({
      kind: 'queued',
    })
    await expect(
      activeRepository.saveRefined({
        reference: current,
        refinedText: 'refined-1',
      }),
    ).resolves.toMatchObject({ kind: 'stored' })
    await expect(
      activeRepository.saveRefined({
        reference: current,
        refinedText: 'refined-2',
      }),
    ).resolves.toMatchObject({
      kind: 'already_completed',
      segment: { refinedText: 'refined-1' },
    })
    await expect(
      activeRepository.saveRefined({
        reference: previous,
        refinedText: 'refined-1',
      }),
    ).resolves.toMatchObject({ kind: 'not_current', currentRevision: 2 })
  })

  it('loads ascending refined and draft context without a partial segment', async () => {
    const activeRegistry = registry!
    const activeRepository = liveRepository()
    const sessionId = registerSessionId(activeRegistry)
    const connectionId = registerConnectionId(activeRegistry, 'context')
    const firstSegmentId = registerSegmentId(activeRegistry)
    const secondSegmentId = registerSegmentId(activeRegistry)
    const partialSegmentId = registerSegmentId(activeRegistry)
    const value = session(sessionId)
    const first = {
      sessionId,
      segmentId: firstSegmentId,
      sequence: 1,
      revision: 1,
      sourceText: 'source-1',
      isFinal: true,
      startMs: 0,
      endMs: 100,
    }
    const second = {
      ...first,
      segmentId: secondSegmentId,
      sequence: 2,
      sourceText: 'source-2',
      startMs: 100,
      endMs: 200,
    }
    const partial = {
      ...first,
      segmentId: partialSegmentId,
      sequence: 3,
      sourceText: 'source-3',
      isFinal: false,
      startMs: 200,
      endMs: 300,
    }

    await expect(
      activeRepository.startOrReattach({
        session: value,
        connection: connection(connectionId),
      }),
    ).resolves.toEqual({ kind: 'created' })
    await expect(
      activeRepository.acceptTranscriptRevision(first),
    ).resolves.toEqual({ kind: 'accepted', revision: 1 })
    await expect(
      activeRepository.saveDraft({
        reference: first,
        isFinal: true,
        draftText: 'draft-1',
      }),
    ).resolves.toMatchObject({ kind: 'stored' })
    await expect(activeRepository.markRefinementQueued(first)).resolves.toEqual(
      {
        kind: 'queued',
      },
    )
    await expect(
      activeRepository.saveRefined({
        reference: first,
        refinedText: 'refined-1',
      }),
    ).resolves.toMatchObject({ kind: 'stored' })
    await expect(
      activeRepository.acceptTranscriptRevision(second),
    ).resolves.toEqual({ kind: 'accepted', revision: 1 })
    await expect(
      activeRepository.saveDraft({
        reference: second,
        isFinal: true,
        draftText: 'draft-2',
      }),
    ).resolves.toMatchObject({ kind: 'stored' })
    await expect(
      activeRepository.acceptTranscriptRevision(partial),
    ).resolves.toEqual({ kind: 'accepted', revision: 1 })

    await expect(
      activeRepository.getPreviousFinalSegments({
        sessionId,
        beforeSequence: 4,
        limit: 2,
      }),
    ).resolves.toEqual({
      kind: 'loaded',
      context: [
        {
          segmentId: firstSegmentId,
          sequence: 1,
          sourceText: 'source-1',
          translatedText: 'refined-1',
          translationKind: 'refined',
        },
        {
          segmentId: secondSegmentId,
          sequence: 2,
          sourceText: 'source-2',
          translatedText: 'draft-2',
          translationKind: 'draft',
        },
      ],
    })
  })
})
