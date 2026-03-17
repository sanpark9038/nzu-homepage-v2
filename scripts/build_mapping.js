const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

async function buildRobustMapping() {
  const cnineUrl = 'https://www.cnine.kr/api/v2/p/starcraft/soop/player?size=1000';
  const outputPath = path.join('c:', 'Users', 'NZU', 'Desktop', 'nzu-homepage', 'scripts', 'player_metadata.json');
  
  try {
    console.log('--- Step 1: Fetching CNINE Data ---');
    const { data: body } = await axios.get(cnineUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const cninePlayers = body.data || [];
    
    const maleIdMap = {};
    const femaleIdMap = {};

    cninePlayers.forEach(p => {
      const bjName = p.name;
      if (p.eloboardKey) {
        const keys = p.eloboardKey.split(',');
        keys.forEach(k => {
          const match = k.match(/([MWP])_(\d+)/);
          if (match) {
            const type = match[1];
            const id = match[2];
            if (type === 'W') femaleIdMap[id] = bjName;
            else maleIdMap[id] = bjName; // P and M are usually the same "Main" board
          }
        });
      }
    });

    console.log(`CNINE Sync: Found ${Object.keys(maleIdMap).length} Men and ${Object.keys(femaleIdMap).length} Women mappings.`);

    const finalMapping = {
      ids: { ...maleIdMap, ...femaleIdMap }, // Common IDs
      names: {}
    };

    console.log('--- Step 2: Fetching Eloboard Master Lists to correlate Real Names ---');
    
    // Function to correlate names from a board
    const correlate = async (url, idMap, label) => {
      console.log(`  Fetching ${label} list...`);
      try {
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(html);
        $('a.p_name').each((i, el) => {
          const rawText = $(el).text().trim();
          const namePart = rawText.split('(')[0].trim();
          const href = $(el).attr('href') || '';
          const wrIdMatch = href.match(/wr_id=(\d+)/);
          if (wrIdMatch && idMap[wrIdMatch[1]]) {
            finalMapping.names[namePart] = idMap[wrIdMatch[1]];
          }
        });
      } catch (e) {
        console.error(`  Failed ${label}: ${e.message}`);
      }
    };

    // 1. Men's Master List
    await correlate('https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list', maleIdMap, 'Men');
    
    // 2. Women's Master List (Optional, but good for completeness)
    await correlate('https://eloboard.com/women/bbs/board.php?bo_table=bj_list', femaleIdMap, 'Women');

    // Step 3: Manual Overrides for known issues
    finalMapping.names['김성민'] = '구라미스';
    finalMapping.ids['521'] = '구라미스'; // Newcastle Univ ID
    
    // Add known important ones if missing
    if (!finalMapping.names['박현재']) finalMapping.names['박현재'] = '샤이니';
    if (!finalMapping.names['김재현']) finalMapping.names['김재현'] = '액션구드론';

    fs.writeFileSync(outputPath, JSON.stringify(finalMapping, null, 2));
    console.log(`--- Finished! ---`);
    console.log(`IDs: ${Object.keys(finalMapping.ids).length}`);
    console.log(`Names: ${Object.keys(finalMapping.names).length}`);

  } catch (e) {
    console.error(`Fatal Error: ${e.message}`);
  }
}

buildRobustMapping();
