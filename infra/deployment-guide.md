# Deploy the MyBRSE Backend to AWS

Run all commands from the repository root.

## 1. Prepare the tools

Install Node.js 24, pnpm 11.8.0, AWS CLI v2, and AWS SAM CLI.
Check the versions, then install dependencies:

```bash
node --version
pnpm --version
aws --version
sam --version
pnpm install --frozen-lockfile
```

## 2. Configure AWS access

Use an AWS test account and a deployment identity authorized to manage
CloudFormation, deployment artifacts in S3, Lambda, API Gateway, DynamoDB,
SQS, and the stack's IAM roles and policies, including `iam:PassRole`.
The integration-test policy in `infra/iam/` does not grant deployment access.

For an IAM User access key, create a named local profile:

```bash
aws configure --profile mybrse-deploy
```

Enter the access key and secret at the local prompts, your chosen AWS Region,
and `json` as the output format. If your organization provides an SSO profile,
use that profile instead in the commands below.

SAM does not automatically load the repository's `.env` file. Keep credentials
in your local AWS configuration, outside the repository.
See [AWS CLI profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html).

Set the stack name and Region. Replace the example Region with your deployment
Region:

```bash
export MYBRSE_DEPLOY_REGION='ap-southeast-1'
export MYBRSE_STACK_NAME='mybrse-backend-test'
```

## 3. Select the Bedrock model

Open Amazon Bedrock in the selected Region. Choose a model supported by the
backend's Converse adapter and record its model ID or inference profile ID.
If you already ran the Bedrock integration test successfully, use the same ID
and Region.

Complete any model-specific access or subscription requirements in the account.
You will supply the ID as `BedrockModelId` during deployment.
See [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

## 4. Validate and build

Run each command and resolve any failure before continuing:

```bash
pnpm check
pnpm build
sam validate --lint --template-file infra/template.yaml
PATH="$PWD/node_modules/.bin:$PATH" sam build --template-file infra/template.yaml
```

The absolute PATH entry makes the project's esbuild executable available even
when SAM changes to a temporary build directory.
The build must report `Build Succeeded` and produce
`.aws-sam/build/template.yaml` with artifacts for both Lambda functions.
See [sam build](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-build.html).

## 5. Deploy the stack

The following command uploads artifacts and, after confirmation, creates the
WebSocket API, two Lambda functions, DynamoDB table, refinement queue, dead-letter
queue, and IAM roles and policies. AWS usage can incur charges. This template
exposes a WebSocket API without authentication; use it in your test environment.

```bash
sam deploy --guided \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$MYBRSE_STACK_NAME" \
  --region "$MYBRSE_DEPLOY_REGION" \
  --profile mybrse-deploy \
  --capabilities CAPABILITY_IAM
```

Use these values when prompted:

| Setting                              | Value                              |
| ------------------------------------ | ---------------------------------- |
| Stack Name                           | `mybrse-backend-test`              |
| AWS Region                           | Your selected Region               |
| StageName                            | `dev`                              |
| DraftProvider                        | `amazon-translate`                 |
| RefinerProvider                      | `amazon-bedrock`                   |
| BedrockModelId                       | Your model or inference profile ID |
| ContextWindowSize                    | `5`                                |
| SessionRetentionSeconds              | `86400`                            |
| Confirm changes before deploy        | `Y`                                |
| Allow IAM role creation, if prompted | `Y`                                |
| Disable rollback                     | `N`                                |
| Save arguments to configuration file | `Y`                                |
| Configuration environment            | `default`                          |

Record the configuration file location reported by SAM. Review the changeset
and confirm that it targets your test account, Region, and stack before entering
`Y`. Wait for deployment success and CloudFormation status `CREATE_COMPLETE`.
See [sam deploy](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html).

## 6. Retrieve deployment outputs

```bash
aws cloudformation describe-stacks \
  --stack-name "$MYBRSE_STACK_NAME" \
  --region "$MYBRSE_DEPLOY_REGION" \
  --profile mybrse-deploy \
  --query 'Stacks[0].Outputs' \
  --output table
```

Save `WebSocketUrl`, `TranslationStateTableName`, `RefinementQueueUrl`,
`RefinementDeadLetterQueueUrl`, `IngressFunctionName`, and `RefineFunctionName`.
Use the complete WebSocket URL, including the stage suffix `/dev`.

## 7. Verify the deployment

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

## 8. Update the deployment

Repeat validation and build in step 4. Run the deployment command in step 5
with the same stack name, Region, profile, and parameter values. Review the
changeset before applying it. Wait for `UPDATE_COMPLETE`.

## 9. Delete the test deployment

When the test stack is no longer needed, run:

```bash
sam delete \
  --stack-name "$MYBRSE_STACK_NAME" \
  --region "$MYBRSE_DEPLOY_REGION" \
  --profile mybrse-deploy
```

Review the prompts before confirming. Deleting this stack removes its DynamoDB
table and data, along with the other stack resources. Check for leftover
CloudWatch log groups and deployment artifacts afterward.
See [sam delete](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-delete.html).
