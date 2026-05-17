const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Using your active public music video (Fejo - Vazhikatti) which is 100% online
const TEST_URL = 'https://www.youtube.com/watch?v=rhrD7as3KJg'; 

const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const hasCookies = fs.existsSync(COOKIES_PATH);
const cookiesFlag = hasCookies ? `--cookies "${COOKIES_PATH}"` : '';

const tests = [
  {
    name: 'Test 1: Standard Cookieless (With JS Runtime)',
    command: `yt-dlp --js-runtimes node --no-playlist -f "ba" -x --audio-format wav -o "test_std.%(ext)s" "${TEST_URL}"`
  },
  {
    name: 'Test 2: iOS Client Spoofing Cookieless (With JS Runtime)',
    command: `yt-dlp --js-runtimes node --extractor-args "youtube:player_client=ios" --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1" --no-playlist -f "ba" -x --audio-format wav -o "test_ios.%(ext)s" "${TEST_URL}"`
  },
  {
    name: 'Test 3: TV Client Spoofing Cookieless (With JS Runtime)',
    command: `yt-dlp --js-runtimes node --extractor-args "youtube:player_client=tv" --no-playlist -f "ba" -x --audio-format wav -o "test_tv.%(ext)s" "${TEST_URL}"`
  }
];

if (hasCookies) {
  tests.push({
    name: 'Test 4: Guest Cookies Standard (With JS Runtime)',
    command: `yt-dlp --js-runtimes node ${cookiesFlag} --no-playlist -f "ba" -x --audio-format wav -o "test_cookies.%(ext)s" "${TEST_URL}"`
  });
  tests.push({
    name: 'Test 5: Guest Cookies + iOS Spoof (With JS Runtime)',
    command: `yt-dlp --js-runtimes node ${cookiesFlag} --extractor-args "youtube:player_client=ios" --user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1" --no-playlist -f "ba" -x --audio-format wav -o "test_cookies_ios.%(ext)s" "${TEST_URL}"`
  });
} else {
  console.log('💡 Note: No cookies.txt found in directory. Skipping cookie tests.');
}

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
  console.log('Starting SoundRip Server Diagnostics (V2)...');
  console.log('Target Test URL:', TEST_URL);
  console.log('Cookies File Present:', hasCookies);
  
  const results = [];
  for (const test of tests) {
    const res = await runTest(test);
    results.push(res);
    
    // Clean up test files
    const cleanFiles = ['test_std.wav', 'test_ios.wav', 'test_tv.wav', 'test_cookies.wav', 'test_cookies_ios.wav'];
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
}

main();
