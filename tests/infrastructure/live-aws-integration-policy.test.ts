import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

type PolicyStatement = {
  Sid: string
  Effect: string
  Action: string | string[]
  Resource: string
}

type PolicyDocument = {
  Version: string
  Statement: PolicyStatement[]
}

const policyPath = fileURLToPath(
  new URL(
    '../../infra/iam/live-aws-integration-test-policy.json',
    import.meta.url,
  ),
)
const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as PolicyDocument

const FORBIDDEN_ACTIONS = [
  'dynamodb:Scan',
  'dynamodb:CreateTable',
  'dynamodb:DeleteTable',
  'sqs:PurgeQueue',
  'sqs:CreateQueue',
  'sqs:DeleteQueue',
  'execute-api:ManageConnections',
  'iam:CreateAccessKey',
  'sts:GetCallerIdentity',
]

function statementFor(sid: string): PolicyStatement {
  const statement = policy.Statement.find((value) => value.Sid === sid)
  expect(statement, `missing statement ${sid}`).toBeDefined()
  return statement as PolicyStatement
}

function actionsFor(statement: PolicyStatement): string[] {
  return Array.isArray(statement.Action) ? statement.Action : [statement.Action]
}

describe('live AWS integration test-user IAM policy', () => {
  it('grants only the required actions against scoped resources', () => {
    expect(policy.Version).toBe('2012-10-17')
    expect(policy.Statement.map((statement) => statement.Sid)).toEqual([
      'IntegrationDynamoDb',
      'IntegrationSqs',
      'IntegrationTranslate',
      'IntegrationBedrock',
    ])

    const dynamoDb = statementFor('IntegrationDynamoDb')
    expect(dynamoDb).toMatchObject({
      Effect: 'Allow',
      Action: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:BatchWriteItem',
        'dynamodb:TransactWriteItems',
      ],
      Resource:
        'arn:aws:dynamodb:__AWS_REGION__:__AWS_ACCOUNT_ID__:table/__TABLE_NAME__',
    })

    const sqs = statementFor('IntegrationSqs')
    expect(sqs).toMatchObject({
      Effect: 'Allow',
      Action: [
        'sqs:SendMessage',
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:ChangeMessageVisibility',
      ],
      Resource: 'arn:aws:sqs:__AWS_REGION__:__AWS_ACCOUNT_ID__:__QUEUE_NAME__',
    })

    expect(statementFor('IntegrationTranslate')).toEqual({
      Sid: 'IntegrationTranslate',
      Effect: 'Allow',
      Action: 'translate:TranslateText',
      Resource: '*',
    })
    expect(statementFor('IntegrationBedrock')).toEqual({
      Sid: 'IntegrationBedrock',
      Effect: 'Allow',
      Action: 'bedrock:InvokeModel',
      Resource: '*',
    })

    const allActions = policy.Statement.flatMap(actionsFor)
    expect(allActions).not.toEqual(expect.arrayContaining(FORBIDDEN_ACTIONS))
    expect(
      policy.Statement.filter((statement) => statement.Resource === '*'),
    ).toEqual([
      statementFor('IntegrationTranslate'),
      statementFor('IntegrationBedrock'),
    ])
  })
})
