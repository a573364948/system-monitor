const { chromium } = require('playwright');

async function testMemoryCockpit() {
  console.log('🚀 Starting Memory Cockpit tests...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const baseUrl = 'http://localhost:18489';
  const results = [];

  // Helper function to test a page
  async function testPage(name, url, checks) {
    console.log(`📄 Testing: ${name}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1000);

      const errors = [];
      for (const check of checks) {
        try {
          await check(page);
        } catch (error) {
          errors.push(error.message);
        }
      }

      if (errors.length === 0) {
        console.log(`   ✅ ${name} - All checks passed`);
        results.push({ name, status: 'pass' });
      } else {
        console.log(`   ❌ ${name} - Failed:`);
        errors.forEach(err => console.log(`      - ${err}`));
        results.push({ name, status: 'fail', errors });
      }

      // Take screenshot
      await page.screenshot({ path: `/tmp/test-${name.replace(/\s+/g, '-')}.png` });
    } catch (error) {
      console.log(`   ❌ ${name} - Error: ${error.message}`);
      results.push({ name, status: 'error', error: error.message });
    }
    console.log('');
  }

  // Test 1: Homepage loads
  await testPage('Homepage', baseUrl, [
    async (page) => {
      const title = await page.title();
      if (!title.includes('Memory Cockpit')) throw new Error('Title not found');
    },
    async (page) => {
      const heading = await page.locator('h1').textContent();
      if (!heading) throw new Error('Heading not found');
    },
  ]);

  // Test 2: Dashboard Tab
  await testPage('Dashboard Tab', baseUrl, [
    async (page) => {
      await page.click('[data-tab="dashboard"]');
      await page.waitForTimeout(500);
      const panel = await page.locator('#tab-dashboard').isVisible();
      if (!panel) throw new Error('Dashboard panel not visible');
    },
    async (page) => {
      const cards = await page.locator('#dashboardCards .item-card').count();
      if (cards === 0) throw new Error('No dashboard cards found');
    },
  ]);

  // Test 3: Chat Tab
  await testPage('Chat Tab', baseUrl, [
    async (page) => {
      await page.click('[data-tab="chat"]');
      await page.waitForTimeout(1000);
      const panel = await page.locator('#tab-chat').isVisible();
      if (!panel) throw new Error('Chat panel not visible');
    },
    async (page) => {
      const newBtn = await page.locator('#newChatBtn').isVisible();
      if (!newBtn) throw new Error('New chat button not visible');
    },
  ]);

  // Test 4: Permissions Tab
  await testPage('Permissions Tab', baseUrl, [
    async (page) => {
      await page.click('[data-tab="permissions"]');
      await page.waitForTimeout(1000);
      const panel = await page.locator('#tab-permissions').isVisible();
      if (!panel) throw new Error('Permissions panel not visible');
    },
  ]);

  // Test 5: Projects Tab
  await testPage('Projects Tab', baseUrl, [
    async (page) => {
      await page.click('[data-tab="projects"]');
      await page.waitForTimeout(1000);
      const panel = await page.locator('#tab-projects').isVisible();
      if (!panel) throw new Error('Projects panel not visible');
    },
  ]);

  // Test 6: System Tab
  await testPage('System Tab', baseUrl, [
    async (page) => {
      await page.click('[data-tab="system"]');
      await page.waitForTimeout(1000);
      const panel = await page.locator('#tab-system').isVisible();
      if (!panel) throw new Error('System panel not visible');
    },
  ]);

  // Test 7: More Tab
  await testPage('More Tab', baseUrl, [
    async (page) => {
      await page.click('[data-tab="more"]');
      await page.waitForTimeout(500);
      const panel = await page.locator('#tab-more').isVisible();
      if (!panel) throw new Error('More panel not visible');
    },
    async (page) => {
      const cards = await page.locator('#tab-more .item-card').count();
      if (cards < 5) throw new Error('Not enough menu items in More tab');
    },
  ]);

  // Test 8: Share History (sub-tab)
  await testPage('Share History', baseUrl, [
    async (page) => {
      await page.click('[data-tab="more"]');
      await page.waitForTimeout(500);
      await page.click('[data-subtab="share"]');
      await page.waitForTimeout(1000);
      const panel = await page.locator('#tab-share').isVisible();
      if (!panel) throw new Error('Share panel not visible');
    },
  ]);

  // Test 9: Commands (sub-tab)
  await testPage('Commands', baseUrl, [
    async (page) => {
      await page.click('[data-tab="more"]');
      await page.waitForTimeout(500);
      await page.click('[data-subtab="commands"]');
      await page.waitForTimeout(1000);
      const panel = await page.locator('#tab-commands').isVisible();
      if (!panel) throw new Error('Commands panel not visible');
    },
  ]);

  // Test 10: API Health Check
  await testPage('API Health', `${baseUrl}/api/health`, [
    async (page) => {
      const content = await page.content();
      if (!content.includes('"ok": true')) throw new Error('Health check failed');
    },
  ]);

  // Test 11: API Dashboard
  await testPage('API Dashboard', `${baseUrl}/api/dashboard`, [
    async (page) => {
      const content = await page.content();
      if (!content.includes('generatedAt')) throw new Error('Dashboard API failed');
    },
  ]);

  // Test 12: API Chat Conversations
  await testPage('API Chat', `${baseUrl}/api/chat/conversations`, [
    async (page) => {
      const content = await page.content();
      if (!content.includes('"ok"')) throw new Error('Chat API failed');
    },
  ]);

  // Test 13: API Commands
  await testPage('API Commands', `${baseUrl}/api/control/commands`, [
    async (page) => {
      const content = await page.content();
      if (!content.includes('"commands"')) throw new Error('Commands API failed');
    },
  ]);

  // Test 14: API Share History
  await testPage('API Share', `${baseUrl}/api/share/history`, [
    async (page) => {
      const content = await page.content();
      if (!content.includes('"history"')) throw new Error('Share API failed');
    },
  ]);

  await browser.close();

  // Summary
  console.log('═══════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('═══════════════════════════════════════');
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Errors: ${errors}`);
  console.log(`📈 Total:  ${results.length}`);
  console.log('═══════════════════════════════════════\n');

  if (failed > 0 || errors > 0) {
    console.log('Failed/Error tests:');
    results.filter(r => r.status !== 'pass').forEach(r => {
      console.log(`  - ${r.name}: ${r.status}`);
      if (r.errors) r.errors.forEach(e => console.log(`    ${e}`));
      if (r.error) console.log(`    ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
    process.exit(0);
  }
}

testMemoryCockpit().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
