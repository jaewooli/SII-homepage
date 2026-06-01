const path = require('path');

// Headless Chrome Login to Dreamhack
async function loginDreamhackWithPuppeteer() {
  console.log('[Headless Chrome] Lazy loading puppeteer...');
  const puppeteer = require('puppeteer');
  console.log('[Headless Chrome] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  let page = null;
  try {
    page = await browser.newPage();
    
    // Bypass webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('[Headless Chrome] Navigating to Dreamhack login page...');
    await page.goto('https://dreamhack.io/login/', { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    console.log('[Headless Chrome] Submitting credentials...');
    await page.type('input[type="email"]', process.env.DREAMHACKEMAIL, { delay: 50 });
    await page.type('input[type="password"]', process.env.DREAMHACKPASSWORD, { delay: 50 });

    const submitBtn = await page.waitForSelector('button[type="submit"]');
    await Promise.all([
      submitBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
    ]);

    console.log('[Headless Chrome] Login submitted. Extracting cookies...');
    const cookies = await page.cookies();
    const sessionidCookie = cookies.find(c => c.name === 'sessionid');
    const csrfCookie = cookies.find(c => c.name === 'csrf_token' || c.name === 'csrftoken');

    if (sessionidCookie && sessionidCookie.value) {
      console.log('[Headless Chrome] Login success. Cookies captured.');
      return {
        sessionid: sessionidCookie.value,
        csrftoken: csrfCookie ? csrfCookie.value : ''
      };
    } else {
      console.error('[Headless Chrome] Failed to find sessionid cookie in login page response.');
    }
  } catch (err) {
    console.error('[Headless Chrome] Login routine error:', err.message);
    if (page) {
      try {
        const html = await page.content();
        console.log('[Headless Chrome] Error page HTML snippet:', html.substring(0, 1500));
        const screenshotPath = path.join(__dirname, '../../log/error_screenshot.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`[Headless Chrome] Error screenshot saved to: ${screenshotPath}`);
      } catch (e) {
        console.error('[Headless Chrome] Failed to record error state:', e.message);
      }
    }
  } finally {
    await browser.close();
  }
  return null;
}

module.exports = {
  loginDreamhackWithPuppeteer
};
