const axios = require('axios');
const cheerio = require('cheerio');

async function analyze() {
    try {
        console.log('--- Step 1: Scanning Eloboard University List ---');
        const univRes = await axios.get('https://eloboard.com/univ/bbs/board.php?bo_table=univ_list', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(univRes.data);
        const aliveUnivs = [];
        
        // Find links of type bo_table=univ_list&wr_id=...
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const wrIdMatch = href.match(/bo_table=univ_list&wr_id=(\d+)/);
            if (wrIdMatch) {
                const name = $(el).text().trim() || $(el).find('img').attr('title') || $(el).find('img').attr('alt');
                if (name && name !== '대학랭킹' && name !== '전체') {
                    aliveUnivs.push({ id: wrIdMatch[1], name });
                }
            }
        });
        
        // Deduplicate
        const uniqueUnivs = Array.from(new Map(aliveUnivs.map(u => [u.id, u])).values());
        console.log(`Found ${uniqueUnivs.length} alive universities on Eloboard.`);
        console.log('Univs:', uniqueUnivs.map(u => `${u.name}(${u.id})`).join(', '));

        console.log('\n--- Step 2: Extracting SSUSTAR Rosters ---');
        const battleRes = await axios.get('https://ssustar.iwinv.net/university_battle.php');
        const rosterMatch = battleRes.data.match(/const collegeRosters = (\{.*?\});/s);
        const rosters = rosterMatch ? JSON.parse(rosterMatch[1]) : {};
        console.log(`Found ${Object.keys(rosters).length} Rosters on SSUSTAR.`);

        console.log('\n--- Step 3: Extracting SSUSTAR 1vs1 Active Pool ---');
        const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const allPlayers = [];
        const pRegex = /\{"key":"(.*?)"\}/g;
        let pMatch;
        while ((pMatch = pRegex.exec(vsRes.data)) !== null) {
            allPlayers.push(pMatch[1]);
        }
        console.log(`Found ${allPlayers.length} Active Player Keys on SSUSTAR.`);

        console.log('\n--- Step 4: Verification ---');
        // Check if SSUSTAR universities match Eloboard ones
        const matchedNames = [];
        Object.keys(rosters).forEach(name => {
            if (uniqueUnivs.some(u => u.name.includes(name) || name.includes(u.name))) {
                matchedNames.push(name);
            }
        });
        console.log(`Matched ${matchedNames.length}/${Object.keys(rosters).length} Universities with Eloboard S9.`);

    } catch (err) {
        console.error('Error:', err.message);
    }
}

analyze();
