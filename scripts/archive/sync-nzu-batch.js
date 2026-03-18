const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const NZU_LIST_URL = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';

// ELO, 전적 수집 함수
async function fetchPlayerStats(eloboardId) {
  const url = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${eloboardId}`;
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    
    let eloPoint = 0;
    const eloInfo = $('th:contains("ELO")').next('td').text().trim() || 
                    $('th:contains("여성ELO")').next('td').text().trim() ||
                    $('th:contains("남성ELO")').next('td').text().trim();
    if (eloInfo) eloPoint = Math.round(parseFloat(eloInfo.replace(/,/g, '')) || 0);

    let wins = 0, losses = 0;
    const matchStr = $('td').filter((i, el) => $(el).text().includes('승') && $(el).text().includes('패')).first().text();
    const wMatch = matchStr.match(/(\d+)승/);
    const lMatch = matchStr.match(/(\d+)패/);
    if (wMatch) wins = parseInt(wMatch[1]);
    if (lMatch) losses = parseInt(lMatch[1]);

    return { eloPoint, wins, losses };
  } catch (error) {
    console.error(`- Failed to fetch stats for ID ${eloboardId}:`, error.message);
    return null;
  }
}

// 늪지대 멤버 리스트 수집
async function runSync() {
  console.log('🚀 Starting Automatic NZU Sync Engine (Batch Mode)');
  try {
    const { data: html } = await axios.get(NZU_LIST_URL, { timeout: 15000 });
    const $ = cheerio.load(html);
    const rows = $('table tbody tr');
    console.log(`📡 Found ${rows.length} members in NZU Roster.`);
    
    // 가져온 기존 내 DB의 멤버 정보
    const { data: currentPlayers } = await supabase.from('players').select('id, name');

    for (let i = 0; i < rows.length; i++) {
        const el = rows[i];
        const $link = $(el).find('td:last-child a');
        if (!$link.length) continue;

        const linkHref = $link.attr('href');
        const wrIdMatch = linkHref.match(/wr_id=(\d+)/);
        if (!wrIdMatch) continue;
        
        const eloboardId = wrIdMatch[1];
        
        // 이름 및 티어 파싱
        const rawNameText = $(el).find('td').eq(0).text().trim();  // "애공(1)"
        let name = rawNameText, tier = 'N/A';
        const tierMatch = rawNameText.match(/\((.*?)\)/);
        if (tierMatch) {
            tier = tierMatch[1];
            name = rawNameText.replace(/\(.*\)/, '').trim();
        }

        // 종족 파싱 "Protoss시즌8전적" -> "P"
        const raceRaw = $(el).find('td').eq(1).text().trim();
        let race = 'T';
        if (raceRaw.includes('Protoss')) race = 'P';
        if (raceRaw.includes('Zerg')) race = 'Z';
        if (raceRaw.includes('Random')) race = 'R';

        console.log(`\n⏳ Syncing: ${name} (Tier: ${tier}, Race: ${race}, ID: ${eloboardId})`);
        
        // Stats 가져오기 (지연을 두어 Rate Limit 방지)
        await new Promise(r => setTimeout(r, 1000));
        const stats = await fetchPlayerStats(eloboardId);
        
        const payload = {
            name,
            tier,
            race,
            eloboard_id: eloboardId,
            elo_point: stats ? stats.eloPoint : 0,
            total_wins: stats ? stats.wins : 0,
            total_losses: stats ? stats.losses : 0,
            last_synced_at: new Date().toISOString()
        };

        // Update if exists in my DB, else Insert
        const existing = currentPlayers.find(p => p.name === name);
        if (existing) {
            const { error } = await supabase.from('players').update(payload).eq('id', existing.id);
            if (error) console.error(`❌ DB Update Error for ${name}:`, error.message);
            else console.log(`✅ Updated ${name} successfully (ELO: ${payload.elo_point})`);
        } else {
            const { error } = await supabase.from('players').insert(payload);
            if (error) console.error(`❌ DB Insert Error for ${name}:`, error.message);
            else console.log(`🆕 Inserted new member ${name} successfully (ELO: ${payload.elo_point})`);
        }
    }
    console.log('\n🎉 NZU Batch Sync Completed Successfully!');
  } catch (err) {
    console.error('Fatal Sync Error:', err.message);
  }
}

runSync();
