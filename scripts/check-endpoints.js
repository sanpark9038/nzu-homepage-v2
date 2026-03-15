const axios = require('axios');
const fs = require('fs');

async function checkEloboardEndpoints() {
  const urlsToTest = [
    'https://eloboard.com/women/bbs/board.php?bo_table=search_list',
    'https://eloboard.com/women/bbs/fight_list.php', // from previous conversation context
    'https://eloboard.com/women/fight_list.php',
    'https://eloboard.com/women/search_list.php'
  ];

  for (const url of urlsToTest) {
    try {
      console.log('Testing:', url);
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: () => true // don't throw on 4xx/5xx
      });
      console.log(`Status: ${res.status}`);
      if (res.status === 200) {
         fs.writeFileSync(`.tmp/test_${url.replace(/[^a-z0-9]/gi, '_')}.html`, res.data);
         console.log(`Saved as .tmp/test_${url.replace(/[^a-z0-9]/gi, '_')}.html`);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

checkEloboardEndpoints();
