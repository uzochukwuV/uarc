const fs = require('fs');
const path = require('path');

const contracts = ['ExecutorHub', 'GlobalRegistry', 'TaskLogicV2'];
const limit = 24576; // EIP-170 limit

console.log('\n📊 Contract Size Analysis\n');
console.log('═'.repeat(70));

contracts.forEach(name => {
  try {
    const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'core', `${name}.sol`, `${name}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath));
    const bytecodeSize = (artifact.bytecode.length - 2) / 2;
    const percentage = (bytecodeSize / limit * 100).toFixed(1);
    const status = bytecodeSize > limit ? '❌ TOO LARGE' : bytecodeSize > limit * 0.9 ? '⚠️  CLOSE' : '✅ OK';

    console.log(`${name}:`);
    console.log(`  Size: ${bytecodeSize.toLocaleString()} bytes (${percentage}% of ${limit.toLocaleString()} byte limit)`);
    console.log(`  Status: ${status}`);
    console.log('─'.repeat(70));
  } catch (e) {
    console.log(`${name}: Error reading artifact - ${e.message}`);
    console.log('─'.repeat(70));
  }
});

console.log('\n');
