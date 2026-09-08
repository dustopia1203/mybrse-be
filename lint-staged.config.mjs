import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// Function tasks run after lint-staged hides unstaged edits, so existence
// reflects the staged snapshot. Pass paths as arguments to preserve spaces.
const checkExistingFiles = (title, commands) => ({
  title,
  task(files) {
    const existing = files.filter((file) => existsSync(file))
    if (existing.length === 0) return
    for (const command of commands) {
      execFileSync('pnpm', ['exec', ...command, ...existing], {
        stdio: 'inherit',
      })
    }
  },
})

export default {
  '*.{ts,mjs}': checkExistingFiles('Check code formatting and lint', [
    ['prettier', '--check'],
    ['eslint', '--max-warnings=0'],
  ]),
  '*.{json,yaml,yml,md}': checkExistingFiles('Check formatting', [
    ['prettier', '--check'],
  ]),
  '*': () => ['pnpm securitycheck', 'pnpm typecheck', 'pnpm test'],
}
