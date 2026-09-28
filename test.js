const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  
  await page.goto('file://' + process.cwd() + '/index.html');
  await page.waitForTimeout(2000);
  console.log('Done testing.');
  await browser.close();
})();
