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

type SamConfig = {
  version: number
  default: {
    global: { parameters: Record<string, unknown> }
    validate: { parameters: Record<string, unknown> }
    build: { parameters: Record<string, unknown> }
    deploy: { parameters: Record<string, unknown> }
  }
}

const ENVIRONMENTS = ['dev', 'stg', 'prod'] as const

const customTags = ['!Ref', '!GetAtt', '!Sub'].map((tag) => ({
  tag,
  resolve: (value: unknown) => value,
}))

function readYaml(relativePath: string): unknown {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return parse(readFileSync(path, 'utf8'), { customTags }) as unknown
}

const templateParameters = (
  readYaml('../../infra/template.yaml') as {
    Parameters: Record<string, Parameter>
  }
).Parameters

function readConfig(environment: string): SamConfig {
  return readYaml(`../../infra/samconfig/${environment}.yaml`) as SamConfig
}

/** Parses SAM's space-delimited `Key=Value` override string. */
function parseOverrides(value: unknown): Record<string, string> {
  expect(typeof value).toBe('string')
  return Object.fromEntries(
    (value as string).split(/\s+/).map((pair) => {
      const separator = pair.indexOf('=')
      expect(separator, `malformed override ${pair}`).toBeGreaterThan(0)
      return [pair.slice(0, separator), pair.slice(separator + 1)]
    }),
  )
}

describe.each(ENVIRONMENTS)('SAM config for %s', (environment) => {
  const config = readConfig(environment)
  const { global, validate, build, deploy } = config.default
  const overrides = parseOverrides(deploy.parameters.parameter_overrides)

  it('targets an environment-specific stack, profile, and stage', () => {
    expect(config.version).toBe(0.1)
    expect(global.parameters).toMatchObject({
      stack_name: `mybrse-backend-${environment}`,
      profile: `mybrse-${environment}`,
    })
    expect(global.parameters.region).toEqual(expect.any(String))
    expect(overrides.StageName).toBe(environment)
    expect(deploy.parameters).toMatchObject({
      s3_prefix: `mybrse-backend-${environment}`,
      tags: `Project=mybrse Environment=${environment}`,
    })
  })

  it('validates and builds the source template, then deploys the build', () => {
    expect(validate.parameters).toEqual({
      template_file: 'infra/template.yaml',
      lint: true,
    })
    expect(build.parameters).toEqual({ template_file: 'infra/template.yaml' })
    expect(deploy.parameters).toMatchObject({
      template_file: '.aws-sam/build/template.yaml',
      capabilities: 'CAPABILITY_IAM',
      confirm_changeset: true,
      resolve_s3: true,
    })
  })

  it('sets every template parameter to a value the template accepts', () => {
    expect(Object.keys(overrides).sort()).toEqual(
      Object.keys(templateParameters).sort(),
    )

    for (const [name, value] of Object.entries(overrides)) {
      const parameter = templateParameters[name] as Parameter
      expect(value, name).not.toBe('')
      if (parameter.AllowedValues) {
        expect(parameter.AllowedValues.map(String), name).toContain(value)
      }
      if (parameter.Type === 'Number') {
        expect(Number.isInteger(Number(value)), name).toBe(true)
        expect(Number(value), name).toBeGreaterThanOrEqual(
          parameter.MinValue ?? Number.NEGATIVE_INFINITY,
        )
      }
    }
  })
})

describe('SAM environments', () => {
  it('use distinct stacks and stages', () => {
    const configs = ENVIRONMENTS.map(readConfig)
    const stacks = configs.map((c) => c.default.global.parameters.stack_name)
    const stages = configs.map(
      (c) =>
        parseOverrides(c.default.deploy.parameters.parameter_overrides)
          .StageName,
    )
    expect(new Set(stacks).size).toBe(ENVIRONMENTS.length)
    expect(new Set(stages).size).toBe(ENVIRONMENTS.length)
  })
})
