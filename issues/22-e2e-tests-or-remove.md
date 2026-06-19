# Issue 22 — Add minimal E2E smoke test or remove `npm run test:e2e` claim

**Type:** Bug / Must-fix
**Blocked by:** Nothing
**Priority:** High — evaluator running the listed command gets an error

---

## Problem

`README.md` documents:

```
npm run test:e2e      # Playwright E2E (requires backend running)
```

`package.json` has `@playwright/test` installed as a devDependency and has a `bench` script,
but there is no `test:e2e` script and no Playwright test files anywhere in the repo.

Running `npm run test:e2e` exits with an npm error immediately. An evaluator following the
README to verify the app will hit this before running a single test.

## Fix options

### Option A — Add a minimal Playwright smoke test (preferred)

Add `playwright.config.ts` at root and `e2e/smoke.spec.ts`:

```ts
// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test'

test('ticker bar renders all 6 symbols', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.getByRole('toolbar', { name: 'Symbol ticker bar' })).toBeVisible()
  for (const sym of ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'PAXGUSD', 'DOGEUSD']) {
    await expect(page.getByText(sym)).toBeVisible()
  }
})

test('connection status shows Connected', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 5000 })
})

test('clicking a symbol updates the focused product', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await page.getByText('ETHUSD').click()
  await expect(page.getByRole('button', { name: /ETHUSD/, pressed: true })).toBeVisible()
})
```

Add `test:e2e` script to `package.json`:

```json
"test:e2e": "playwright test"
```

Add `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

### Option B — Remove the claim (faster)

Remove the `npm run test:e2e` line from the README and the `@playwright/test` devDependency
from `package.json`. Update the Known Limitations section to note E2E tests are not implemented.

## Acceptance criteria

**If Option A:**
- [ ] `npm run test:e2e` (with backend running) exits 0 and all smoke tests pass
- [ ] `playwright.config.ts` exists at root
- [ ] `e2e/smoke.spec.ts` exists with ≥ 3 tests

**If Option B:**
- [ ] No mention of `test:e2e` in README
- [ ] `@playwright/test` removed from devDependencies
- [ ] Known limitations updated

## Files

- `README.md`
- `package.json`
- `playwright.config.ts` (new, Option A)
- `e2e/smoke.spec.ts` (new, Option A)
