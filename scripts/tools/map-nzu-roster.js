const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { BJ_NAME_MAPPING } = require('../utils/db');
const fs = require('fs');
const path = require('path');

const METADATA_PATH = path.join(__dirname, '..', 'player_metadata.json');

async function mapNzuRoster() {
    console.log('🚀 NZU Roster ID Mapping Start...');
    
    // Read existing metadata
    let metadata = [];
    if (fs.existsSync(METADATA_PATH)) {
        metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    }

    const targetUrl = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';
    
    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const html = iconv.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);
        
        const nzuPlayers = [];
        
        // New selector for the Material Dashboard style table
        $('table.table tbody tr').each((i, el) => {
            const row = $(el);
            const nameCell = row.find('td').first();
            const nameLink = nameCell.find('a.p_name');
            
            if (nameLink.length) {
                const rawNameWithNumber = nameLink.text().trim(); // e.g. "쌍디(6)", "인치호(조커)"
                const name = rawNameWithNumber.split('(')[0].trim();
                
                const personalHistoryLink = row.find('a[target="_blank"]').attr('href') || '';
                const wrIdMatch = personalHistoryLink.match(/wr_id=(\d+)/);
                
                if (wrIdMatch) {
                    const wr_id = parseInt(wrIdMatch[1]);
                    const mappedName = BJ_NAME_MAPPING[name] || name;
                    
                    const cells = row.find('td');
                    const raceFull = $(cells[1]).text().trim();
                    const race = raceFull.match(/Zerg|Protoss|Terran/i)?.[0] || 'Unknown';
                    const tierFull = rawNameWithNumber.match(/\(([^)]+)\)/);
                    const tier = tierFull ? tierFull[1] : '?';
                    
                    nzuPlayers.push({ 
                        name: mappedName, 
                        wr_id, 
                        tier, 
                        race
                    });
                }
            }
        });

        console.log(`📊 Found ${nzuPlayers.length} players in NZU Roster.`);

        const newMetadata = [...metadata];
        let updatedCount = 0;

        nzuPlayers.forEach(p => {
            const idx = newMetadata.findIndex(m => m.name === p.name);
            if (idx > -1) {
                if (newMetadata[idx].wr_id !== p.wr_id) {
                    newMetadata[idx].wr_id = p.wr_id;
                    updatedCount++;
                }
            } else {
                newMetadata.push({
                    wr_id: p.wr_id,
                    name: p.name,
                    gender: 'female' // 기본값
                });
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            fs.writeFileSync(METADATA_PATH, JSON.stringify(newMetadata, null, 2));
            console.log(`✅ Updated ${updatedCount} players in player_metadata.json`);
        } else {
            console.log('✨ All NZU players are already mapped in metadata.');
        }

        console.log('\n--- NZU Roster Mapping Status ---');
        nzuPlayers.forEach(p => {
            console.log(`[${p.race.padEnd(7)}] ${p.name.padEnd(6)} | wr_id: ${p.wr_id.toString().padEnd(4)} | Tier: ${p.tier}`);
        });

    } catch (err) {
        console.error('❌ Error mapping roster:', err.message);
    }
}

mapNzuRoster();
