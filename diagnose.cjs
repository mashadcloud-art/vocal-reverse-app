const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_URL = 'https://www.youtube.com/watch?v=BaW_jenozKc'; // standard lightweight test video

const tests = [
  {
    name: 'Test 1: Standard Cookieless',
    command: `yt-dlp --no-playlist -f "ba" -x --audio-format wav -o "test_std.%(ext)s" "${TEST_URL}"`
  },
  {
    name: 'Test 2: iOS Client Spoofing (Cookieless)',
    command: `yt-dlp --extractor-args "youtube:player_client=ios" --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1" --no-playlist -f "ba" -x --audio-format wav -o "test_ios.%(ext)s" "${TEST_URL}"`
  },
  {
    name: 'Test 3: TV Client Spoofing (Cookieless)',
    command: `yt-dlp --extractor-args "youtube:player_client=tv" --no-playlist -f "ba" -x --audio-format wav -o "test_tv.%(ext)s" "${TEST_URL}"`
  },
  {
    name: 'Test 4: IPv6 Forcing (Cookieless)',
    command: `yt-dlp --force-ipv6 --no-playlist -f "ba" -x --audio-format wav -o "test_ipv6.%(ext)s" "${TEST_URL}"`
  }
];

async function runTest(test) {
  console.log(`\n======================================`);
  console.log(`🚀 Running ${test.name}...`);
  console.log(`Executing: ${test.command}`);
  console.log(`======================================`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    exec(test.command, (error, stdout, stderr) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      if (error) {
        console.log(`❌ ${test.name} FAILED in ${duration}s`);
        console.log(`Error Details:\n${stderr || stdout || error.message}`);
        resolve({ success: false, name: test.name });
      } else {
        console.log(`✅ ${test.name} SUCCESS in ${duration}s!`);
        resolve({ success: true, name: test.name });
      }
    });
  });
}

async function main() {
  console.log('Starting SoundRip Server Diagnostics...');
  console.log('Target Test URL:', TEST_URL);
  
  const results = [];
  for (const test of tests) {
    const res = await runTest(test);
    results.push(res);
    
    // Clean up test files if created
    const cleanFiles = ['test_std.wav', 'test_ios.wav', 'test_tv.wav', 'test_ipv6.wav'];
    cleanFiles.forEach(file => {
      if (fs.existsSync(file)) {
        try { fs.unlinkSync(file); } catch(e) {}
      }
    });
  }

  console.log('\n================ DIAGNOSTIC REPORT ================');
  results.forEach(r => {
    console.log(`${r.success ? '✅' : '❌'} ${r.name}: ${r.success ? 'SUCCESS' : 'FAILED'}`);
  });
  console.log('===================================================');
  console.log('\n👉 Copy and paste the terminal output here so we can see which bypass YouTube accepted!');
}

main();
