# Contributing

Use Node.js >=24 and pnpm 11.8.0. The Node requirement is defined in
`package.json` and shared with CI. Install Gitleaks before
committing. On macOS, install Gitleaks with `brew install gitleaks` and use
any Node.js version satisfying >=24.
For other platforms, use the [official Gitleaks releases](https://github.com/gitleaks/gitleaks/releases).
Ensure your terminal and IDE Git environment can find Node, pnpm and Gitleaks.

Install Trivy with `brew install trivy` on macOS, or use the
[official Trivy releases](https://github.com/aquasecurity/trivy/releases),
to run the dependency and infrastructure security scan locally.

Run `pnpm install` to install dependencies and activate Husky hooks.

## Quality checks

- `pnpm lint`: lint TypeScript with type information and JavaScript config files.
- `pnpm lint:fix`: apply available lint fixes; review the resulting diff.
- `pnpm format`: format files with Prettier.
- `pnpm check`: check formatting, lint, types and the default test suite.
- `pnpm securitycheck`: scan staged changes for secrets with redacted output.
- `pnpm security:audit`: check dependency advisories, failing at high or critical
  severity. This requires registry access and includes development dependencies.
- `pnpm security:trivy`: scan dependencies and infrastructure configuration,
  failing at high or critical severity. Requires Trivy and network access to
  update its vulnerability database and checks. Generated files, dependencies
  under `node_modules`, local worktrees and `docs/` are excluded from traversal;
  production and development dependency vulnerabilities are detected from the lockfile.

The two SQS resources explicitly enable `SqsManagedSseEnabled`, verified by
the SAM template test. They carry resource-scoped `AWS-0096` exceptions because
[Trivy's CloudFormation parser](https://github.com/aquasecurity/trivy/blob/v0.74.0/pkg/iac/adapters/cloudformation/aws/sqs/queue.go)
does not read this property. Remove those exceptions when the parser supports
SQS-managed encryption; other resources and checks remain enabled.

Before each commit, lint-staged checks staged code formatting and lint, then
runs the secret scan, full typecheck and default tests. Unstaged tracked changes
are hidden during these checks and restored afterward. Untracked files are not
part of the staged snapshot and may still be visible to the test runner.
Checks do not automatically fix files. Fix failures and stage the changes again.
Missing Gitleaks or a scanner error blocks the commit.

LocalStack and live AWS suites run separately because they require external
services. The GitHub Actions quality workflow repeats the full checks, audits
dependencies, scans Git history and runs Trivy. CI downloads the latest Gitleaks
and Trivy releases and verifies their published checksums. Trivy runs separately
from pre-commit so commits do not depend on its database downloads.
Repository administrators can require its
`checks` job in branch protection; local hooks alone cannot enforce merge rules.

## JSDoc

Document public workflows, port contracts and non-obvious domain rules in English.
Explain side effects, ordering, duplicate handling, retry decisions and result
semantics. Use `@param`, `@returns` or `@throws` only when they add information;
do not repeat TypeScript types or add `@throws` for errors returned as values.
Update comments when behavior changes. Trivial private helpers and re-exports
do not need boilerplate comments.

Never stage or commit files under `docs/`. Inspect
`git diff --cached --name-only` before committing.
