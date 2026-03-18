const axios = require('axios');
const fs = require('fs');

async function check() {
  try {
    const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
    const pRegex = /\{"key":"(.*?)"\}/g;
    let match;
    const players = [];
    while ((match = pRegex.exec(res.data)) !== null) {
      players.push(match[1]);
    }
    fs.writeFileSync('ssustar_all.json', JSON.stringify(players, null, 2));
    console.log(`Found ${players.length} players`);
  } catch (e) {
    console.error(e.message);
  }
}
check();
