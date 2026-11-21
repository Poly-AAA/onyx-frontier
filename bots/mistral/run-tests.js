const fs = require('node:fs');
const path = require('node:path');
const { exit } = require('node:process');

async function runTests() {
  const testDir = path.join(__dirname, 'tests');
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));
  const results = [];

  for (const file of testFiles) {
    const absolutePath = path.join(testDir, file);
    try {
      const testFn = require(absolutePath);
      const fileResults = await testFn();
      results.push(...Array.isArray(fileResults) ? fileResults : [fileResults]);
    } catch (err) {
      results.push({
        name: file,
        status: 'FAIL',
        detail: err.message
      });
    }
  }

  const summary = {
    total: results.length,
    pass: results.filter(r => r.status === 'PASS').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    skip: results.filter(r => r.status === 'SKIP').length
  };

  console.log(JSON.stringify(results, null, 2));
  console.log(`Summary: ${summary.pass} PASS, ${summary.fail} FAIL, ${summary.skip} SKIP`);
  exit(summary.fail > 0 ? 1 : 0);
}

runTests().catch(() => exit(1));