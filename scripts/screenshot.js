const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    defaultViewport: { width: 1280, height: 800 }
  });
  
  const page = await browser.newPage();
  
  if (!fs.existsSync('docs/screenshots')) {
    fs.mkdirSync('docs/screenshots', { recursive: true });
  }

  const urls = [
    { name: 'tier', url: 'http://localhost:3000/tier' },
    { name: 'admin_ops', url: 'http://localhost:3000/admin/ops' },
    { name: 'admin_roster', url: 'http://localhost:3000/admin/roster' },
    { name: 'live', url: 'http://localhost:3000/live' },
    { name: 'match', url: 'http://localhost:3000/match' },
  ];

  for (const item of urls) {
    try {
      console.log(`Navigating to ${item.url}...`);
      await page.goto(item.url, { waitUntil: 'networkidle0', timeout: 15000 });
      // Wait a bit extra for dynamic content
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: `docs/screenshots/${item.name}.png`, fullPage: false });
      console.log(`Saved ${item.name}.png`);
    } catch (err) {
      console.error(`Error on ${item.url}:`, err.message);
    }
  }

  // Find a player ID from tier page
  try {
    await page.goto('http://localhost:3000/tier', { waitUntil: 'networkidle0' });
    const playerId = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/player/"]');
      return a ? a.getAttribute('href').split('/player/')[1] : null;
    });
    
    if (playerId) {
      console.log(`Found player ID: ${playerId}, navigating...`);
      await page.goto(`http://localhost:3000/player/${playerId}`, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: `docs/screenshots/player.png`, fullPage: false });
      console.log(`Saved player.png`);
    }
  } catch (err) {
    console.error(`Error grabbing player:`, err.message);
  }

  await browser.close();
}

run().catch(console.error);
