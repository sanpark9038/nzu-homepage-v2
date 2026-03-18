const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchMapping() {
  const url = 'https://www.cnine.kr/api/v2/p/starcraft/soop/player?size=1000';
  try {
    const { data } = await axios.get(url, { headers: { 'Accept': 'application/json' } });
    const players = data.content || [];
    const mapping = {};
    
    players.forEach(p => {
      // CNINE returns eloboard_id which matches wr_id
      if (p.eloboard_id) {
        mapping[p.eloboard_id] = p.nick_name;
      }
    });

    const outputPath = path.join('c:', 'Users', 'NZU', 'Desktop', 'nzu-homepage', 'scripts', 'player_metadata.json');
    fs.writeFileSync(outputPath, JSON.stringify(mapping, null, 2));
    console.log(`Success! Saved ${Object.keys(mapping).length} player mappings to ${outputPath}`);
  } catch (e) {
    console.error(`Error fetching CNINE mapping: ${e.message}`);
  }
}

fetchMapping();
