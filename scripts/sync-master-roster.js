const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Robustly parses race from text
 */
function parseRace(text) {
    const t = text.toLowerCase();
    if (t.includes('zerg')) return 'Z';
    if (t.includes('protoss')) return 'P';
    if (t.includes('terran')) return 'T';
    if (t.includes('random')) return 'R';
    return 'U';
}

async function syncAllBJs() {
    console.log('🚀 Starting Master BJ Roster Sync (Multi-page & Accurate Race)...');
    
    let allPlayers = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 15) { // Safety limit to 15 pages (approx 300 players)
        console.log(`- Scrapping Page ${page}...`);
        const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=${page}`;
        
        try {
            const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
            const $ = cheerio.load(html);
            const rows = $('div.table-responsive table tbody tr');
            
            if (rows.length === 0) {
                hasMore = false;
                break;
            }

            rows.each((i, row) => {
                const cells = $(row).find('td');
                if (cells.length < 5) return;

                // 1. Name & Tier
                const nameAnchor = $(row).find('a.p_name');
                const rawNameText = nameAnchor.text().trim();
                let name = rawNameText;
                let tier = 'N/A';
                const tierMatch = rawNameText.match(/\((.*?)\)/);
                if (tierMatch) {
                    tier = tierMatch[1];
                    name = rawNameText.replace(/\s*\((.*?)\)/, '').trim();
                }

                // 2. Race (Row's second cell usually contains the race text)
                const raceCellText = $(cells[1]).text().trim();
                const race = parseRace(raceCellText);

                // 3. University
                const univText = $(cells[3]).text().trim();
                const university = univText || null;

                // 4. Eloboard ID
                const href = nameAnchor.attr('href') || '';
                const idMatch = href.match(/wr_id=(\d+)/);
                const eloboard_id = idMatch ? idMatch[1] : null;

                if (name && !allPlayers.find(p => p.name === name)) {
                    allPlayers.push({
                        name,
                        tier,
                        race,
                        university,
                        eloboard_id,
                        last_synced_at: new Date().toISOString()
                    });
                }
            });

            // Check if we reached the end by checking pagination
            const nextButton = $('.pagination a').filter((i, el) => $(el).text().includes('다음') || $(el).attr('href')?.includes(`page=${page + 1}`));
            if (nextButton.length === 0) {
                // hasMore = false; // Sometimes pagination is tricky, let's just increment and check rows.length
            }
            
            if (rows.length < 10) hasMore = false; // Usually 20 per page

            page++;
            await new Promise(r => setTimeout(r, 500)); // Rate limiting

        } catch (e) {
            console.error(`❌ Error on page ${page}:`, e.message);
            hasMore = false;
        }
    }

    console.log(`\n📊 Total Scraped: ${allPlayers.length} players.`);

    // Batch upsert to Supabase
    const chunkSize = 100;
    for (let i = 0; i < allPlayers.length; i += chunkSize) {
        const chunk = allPlayers.slice(i, i + chunkSize);
        const { error } = await supabase
            .from('players')
            .upsert(chunk, { onConflict: 'name' });
        
        if (error) console.error(`- Error in chunk ${i}:`, error.message);
        else console.log(`- Upserted chunk ${i / chunkSize + 1}`);
    }

    console.log('✅ Master BJ Sync Completed with Precision.');
}

syncAllBJs();
