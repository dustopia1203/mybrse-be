# Deploy the MyBRSE Backend to AWS

Run all commands from the repository root. Each environment has its own SAM CLI
configuration file, so every deployment uses the same commands and differs only
in the file passed to `--config-file`.

## 1. Environments

| Environment | Config file                 | Stack                 | Stage  | AWS profile   |
| ----------- | --------------------------- | --------------------- | ------ | ------------- |
| dev         | `infra/samconfig/dev.yaml`  | `mybrse-backend-dev`  | `dev`  | `mybrse-dev`  |
| stg         | `infra/samconfig/stg.yaml`  | `mybrse-backend-stg`  | `stg`  | `mybrse-stg`  |
| prod        | `infra/samconfig/prod.yaml` | `mybrse-backend-prod` | `prod` | `mybrse-prod` |

Each file sets, under its `default` SAM environment:

- `global`: stack name, Region, and AWS profile, shared by every SAM command.
- `validate` and `build`: the source template `infra/template.yaml`.
- `deploy`: the built template, `CAPABILITY_IAM`, changeset confirmation,
  a SAM-managed artifact bucket with a per-stack prefix, stack tags, and
  `parameter_overrides` for every template parameter.

All environments currently deploy to `us-east-1` with the Bedrock inference
profile `global.amazon.nova-2-lite-v1:0`, the pair verified by the live AWS
integration tests.

### Change environment values

Edit the environment's file and commit the change; do not pass
`--parameter-overrides` or `--guided` on the command line. A command-line
`--parameter-overrides` replaces the whole list from the file, so any parameter
it omits falls back to the template default or fails if it has none.
`--guided` rewrites the configuration file.

`parameter_overrides` is one space-separated string folded across lines; keep
one `Key=Value` per line without spaces in values. It must set every parameter
declared in `infra/template.yaml`. `pnpm test` runs
`tests/infrastructure/samconfig.test.ts`, which checks that each file sets all
template parameters to allowed values and that stacks and stages are distinct.
When you add a template parameter, add it to all three files.

## 2. Prepare the tools

Install Node.js >=24, pnpm 11.8.0, AWS CLI v2, and AWS SAM CLI with YAML
configuration support. Check the versions, then install dependencies:

```bash
node --version
pnpm --version
aws --version
sam --version
pnpm install --frozen-lockfile
```

## 3. Configure AWS access

Each environment uses its own named AWS profile, so environments can live in
separate accounts. The deployment identity must be authorized to manage
CloudFormation, deployment artifacts in S3, Lambda, API Gateway, DynamoDB,
SQS, and the stack's IAM roles and policies, including `iam:PassRole`.
The integration-test policy in `infra/iam/` does not grant deployment access.

Create the profile for the environment you deploy. For an SSO profile:

```bash
aws configure sso --profile mybrse-dev
```

For an IAM User access key:

```bash
aws configure --profile mybrse-dev
```

Enter the Region from the environment's config file and `json` as the output
format. Keep credentials in your local AWS configuration; SAM does not load the
repository's `.env` file. Confirm the profile targets the intended account:

```bash
aws sts get-caller-identity --profile mybrse-dev
```

See [AWS CLI profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

## 4. Confirm Bedrock model access

Open Amazon Bedrock in the environment's account and Region. Confirm the model
or inference profile in `BedrockModelId` is available and that any
model-specific access or subscription requirements are complete. To use a
different model, choose one supported by the backend's Converse adapter and
update `BedrockModelId` in the environment's file.
See [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

## 5. Select the environment

Set these variables in the shell you deploy from. Replace `dev` with `stg` or
`prod` as needed:

```bash
export MYBRSE_ENV='dev'
export MYBRSE_SAM_CONFIG="infra/samconfig/${MYBRSE_ENV}.yaml"
```

## 6. Validate and build

Run each command and resolve any failure before continuing:

```bash
pnpm check
sam validate --config-file "$MYBRSE_SAM_CONFIG"
PATH="$PWD/node_modules/.bin:$PATH" sam build --config-file "$MYBRSE_SAM_CONFIG"
```

`sam validate` runs with `--lint` from the config file. The absolute PATH entry
makes the project's esbuild executable available even when SAM changes to a
temporary build directory. The build must report `Build Succeeded` and produce
`.aws-sam/build/template.yaml` with artifacts for both Lambda functions.

The build output does not depend on the environment; parameters are applied
at deployment. Always rebuild from the commit you intend to deploy.
See [sam build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html).

## 7. Deploy the stack

```bash
sam deploy --config-file "$MYBRSE_SAM_CONFIG"
```

SAM uploads artifacts, then shows a changeset that creates or updates the
WebSocket API, two Lambda functions, the DynamoDB table, the refinement queue
and dead-letter queue, and IAM roles and policies. Before entering `y`, confirm
the stack name, account, and Region match the environment. Wait for
`CREATE_COMPLETE` on the first deployment or `UPDATE_COMPLETE` afterward.
An unchanged stack reports no changes and exits successfully.
AWS usage can incur charges.
See [sam deploy](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html).

## 8. Retrieve deployment outputs

```bash
sam list stack-outputs --config-file "$MYBRSE_SAM_CONFIG" --output table
```

Save `WebSocketUrl`, `TranslationStateTableName`, `RefinementQueueUrl`,
`RefinementDeadLetterQueueUrl`, `IngressFunctionName`, and `RefineFunctionName`.
Use the complete WebSocket URL, including the stage suffix such as `/dev`.

## 9. Verify the deployment

Connect a WebSocket client to `WebSocketUrl`. Replace the placeholders below
with fresh lowercase UUID v7 identifiers.

Send:

```json
{
  "action": "session.start",
  "sessionId": "<session-uuid-v7>",
  "sourceLanguage": "ja",
  "targetLanguage": "vi"
}
```

Wait for `session.started`, then send:

```json
{
  "action": "transcript.upsert",
  "sessionId": "<session-uuid-v7>",
  "segmentId": "<segment-uuid-v7>",
  "sequence": 1,
  "revision": 1,
  "text": "こんにちは",
  "isFinal": true,
  "startMs": 0,
  "endMs": 1000
}
```

Keep the connection open and verify that `subtitle.draft` arrives, followed by
`subtitle.refined` for the same session, segment, and revision.

If deployment fails, inspect CloudFormation **Events** for the first failed
resource. If messages fail after deployment, open the corresponding Lambda
function's **Monitor → CloudWatch logs**. For missing refinement results,
also check the SQS event source mapping, dead-letter queue, and Bedrock access.

## 10. Promote a release

Deploy the same commit through `dev`, `stg`, and `prod` in order. For each
environment, set `MYBRSE_ENV`, then repeat steps 6 to 9. Promote only after the
previous environment passes verification.

Before deploying `prod`, note that the template is not yet production-hardened:

- The WebSocket API accepts unauthenticated connections.
- The DynamoDB table has no deletion or replacement retention policy, so
  deleting the stack or replacing the table deletes session data.

Review the `prod` changeset for any replacement of `TranslationStateTable`
before confirming.

## 11. Delete an environment

When a `dev` or `stg` stack is no longer needed, run:

```bash
sam delete --config-file "$MYBRSE_SAM_CONFIG"
```

Do not delete `prod` unless its data can be discarded. Review the prompts
before confirming. Deleting a stack removes its DynamoDB table and data, along
with the other stack resources. Check for leftover CloudWatch log groups and
deployment artifacts under the stack's S3 prefix afterward.
See [sam delete](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-delete.html).
