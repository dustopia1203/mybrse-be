import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Parameter = {
  Type: string
  Default?: string | number
  AllowedValues?: Array<string | number>
  MinLength?: number
  MinValue?: number
}

type SamResource = {
  Type: string
  Properties: Record<string, unknown>
  Metadata?: Record<string, unknown>
}

type SamTemplate = {
  AWSTemplateFormatVersion: string
  Transform: string
  Parameters: Record<string, Parameter>
  Resources: Record<string, SamResource>
  Outputs?: Record<string, { Value: unknown }>
}

const customTags = [
  {
    tag: '!Ref',
    resolve(value: unknown) {
      return { Ref: value }
    },
  },
  {
    tag: '!GetAtt',
    resolve(value: unknown) {
      return { 'Fn::GetAtt': value }
    },
  },
  {
    tag: '!Sub',
    resolve(value: unknown) {
      return { 'Fn::Sub': value }
    },
  },
]

const templatePath = fileURLToPath(
  new URL('../../infra/template.yaml', import.meta.url),
)
const template = parse(readFileSync(templatePath, 'utf8'), {
  customTags,
}) as SamTemplate

function resource(logicalId: string): SamResource {
  const value = template.Resources[logicalId]
  expect(value, `missing resource ${logicalId}`).toBeDefined()
  return value as SamResource
}

describe('SAM template foundation', () => {
  it('uses the SAM transform and exposes constrained deployment parameters', () => {
    expect(template.AWSTemplateFormatVersion).toBe('2010-09-09')
    expect(template.Transform).toBe('AWS::Serverless-2016-10-31')
    expect(template.Parameters).toEqual({
      StageName: { Type: 'String', Default: 'dev', MinLength: 1 },
      DraftProvider: {
        Type: 'String',
        Default: 'amazon-translate',
        AllowedValues: ['amazon-translate'],
      },
      RefinerProvider: {
        Type: 'String',
        Default: 'amazon-bedrock',
        AllowedValues: ['amazon-bedrock'],
      },
      BedrockModelId: { Type: 'String', MinLength: 1 },
      ContextWindowSize: { Type: 'Number', Default: 5, MinValue: 1 },
      SessionRetentionSeconds: {
        Type: 'Number',
        Default: 86400,
        MinValue: 1,
      },
    })
  })
})

describe('state resources', () => {
  it('defines an on-demand composite-key table with TTL', () => {
    expect(resource('TranslationStateTable')).toEqual({
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      },
    })
  })

  it('defines a standard refinement queue with a three-attempt DLQ redrive', () => {
    expect(resource('RefinementDeadLetterQueue')).toEqual({
      Type: 'AWS::SQS::Queue',
      Properties: {},
    })
    expect(resource('RefinementQueue')).toEqual({
      Type: 'AWS::SQS::Queue',
      Properties: {
        VisibilityTimeout: 180,
        RedrivePolicy: {
          deadLetterTargetArn: {
            'Fn::GetAtt': 'RefinementDeadLetterQueue.Arn',
          },
          maxReceiveCount: 3,
        },
      },
    })
  })
})
