# Repository Guidelines

## Project Structure & Module Organization

- `src/domain/` defines business models; `src/application/` implements session, draft translation, and refinement workflows.
- `src/ports/` defines interfaces; `src/adapters/aws/` implements DynamoDB, SQS, Translate, Bedrock, and API Gateway integrations.
- `src/contracts/` defines message schemas; `src/handlers/` contains Lambda handlers; `src/composition/` wires dependencies and configuration.
- `tests/` mirrors source modules, with reusable `fakes/` and JSON `fixtures/`. LocalStack tests live in `tests/localstack/`; live AWS tests in `tests/integration/aws/`.
- `infra/template.yaml` defines the SAM stack; `infra/iam/` holds integration-test permissions.

Keep business logic independent of AWS implementations through the port interfaces.

## Build, Test, and Development Commands

Use Node.js >=24 and pnpm 11.8.0. Install dependencies with `pnpm install`.

- `pnpm build` or `pnpm typecheck`: check TypeScript without emitting files.
- `pnpm test`: run the default suite, excluding LocalStack and live AWS tests.
- `pnpm test:watch`: run Vitest in watch mode; supply a test path to focus execution.
- `pnpm test:localstack`: start LocalStack through Docker Compose and run its tests.
- `pnpm localstack:down`: stop LocalStack.
- `pnpm test:integration:aws`: load `.env` when present and run live AWS tests.
- `pnpm format`: apply Prettier formatting.
- `pnpm lint`: run ESLint with TypeScript type information.
- `pnpm securitycheck`: scan staged changes for secrets; requires Gitleaks.
- `pnpm security:audit`: audit dependencies, failing at high or critical severity.
- `pnpm security:trivy`: scan dependencies and infrastructure with Trivy, failing at high or critical severity.
- `pnpm check`: run formatting checks, lint, type checking, and the default test suite.

`pnpm install` activates the pre-commit hook. It checks staged formatting and
lint, scans secrets, then runs type checking and default tests. See
`CONTRIBUTING.md` for tool installation and hook behavior.

There is no standalone development-server script.

## Coding Style & Naming Conventions

Use strict TypeScript and ES modules. Follow Prettier: two-space indentation, single quotes, no semicolons, trailing commas, and an 80-column print width. Use kebab-case filenames, PascalCase types and schemas, and camelCase functions and variables. Use `import type` for type-only imports.

Add JSDoc for public workflows, port contracts, and non-obvious domain rules.
Explain side effects, duplicate handling and retry semantics without repeating
TypeScript types. Keep comments consistent with behavior.

## Testing Guidelines

Use Vitest with `*.test.ts` filenames; live AWS cases use `*.live.test.ts`. Reuse fixtures and fake ports for deterministic workflow tests. Cover changed behavior and failure paths. No numeric coverage threshold is configured. Run `pnpm check` before submitting changes, plus relevant integration suites when changing adapters or infrastructure.

## Commit & Pull Request Guidelines

Follow history’s concise, imperative prefixes: `feat:`, `fix:`, `test:`, and `chore:`. PRs should describe behavior changes, link relevant issues, and report validation commands and results.

Never stage or commit files under `docs/`. Before every commit, inspect `git diff --cached --name-only` and unstage any `docs/` paths.

## Configuration

Use `.env.example` as the configuration reference. Keep credentials out of commits. Run live AWS tests against dedicated test resources with the permissions defined in `infra/iam/`.
