# Project Rules

## Documentation commits are prohibited

- Never stage or commit files under `docs/`.
- Documentation may be created or edited locally, but it must remain
  untracked or unstaged.
- Before every commit, verify that `git diff --cached --name-only` contains no
  path under `docs/`.
- If documentation is staged accidentally, unstage it before committing.
