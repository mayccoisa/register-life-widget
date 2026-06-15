const { defineConfig } = require('@playwright/test');

// E2E do app Electron. Não usa browsers do Playwright — só o Electron do projeto.
module.exports = defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
