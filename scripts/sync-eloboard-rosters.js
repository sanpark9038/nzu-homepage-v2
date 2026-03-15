const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Load player mapping data from player_metadata.json
const fs = require('fs');
const path = require('path');
const playerMetadataPath = path.join(__dirname, 'player_metadata.json');
let playerMetadata = {};
try {
  if (fs.existsSync(playerMetadataPath)) {
    playerMetadata = JSON.parse(fs.readFileSync(playerMetadataPath, 'utf8'));
    console.log(`Loaded ${Object.keys(playerMetadata).length} player metadata mappings.`);
  }
} catch (e) {
  console.warn('Warning: Could not load player_metadata.json:', e.message);
}

/**
 * Helper to get substituted name from metadata using wr_id.
 */
function getPlayerName(originalName, href) {
  if (!href) return originalName;
  const match = href.match(/wr_id=(\d+)/);
  if (match && playerMetadata[match[1]]) {
    return playerMetadata[match[1]];
  }
  return originalName;
}

async function syncRosters() {
  const startTime = Date.now();
  console.log('🚀 Starting Eloboard Roster Sync...');

  try {
    // 1. 대학 리스트 가져오기 (연합팀 포함)
    const { data: universities, error: univError } = await supabase
      .from('universities')
      .select('*');

    if (univError) throw univError;

    let totalProcessed = 0;

    // --- Part 1: Women's & Campus Roster (including FA as '연합팀') ---
    for (const univ of universities) {
      console.log(`\n🏟️ Processing ${univ.name}...`);
      
      const encodedUniv = encodeURIComponent(univ.name);
      const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodedUniv}`;
      
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
          timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const rows = $('table tbody tr'); 
        const playersToUpsert = [];

        rows.each((_, row) => {
          const nameLink = $(row).find('a.p_name');
          if (nameLink.length === 0) return;

          // '연합팀'은 fullText가 " 김인호" 처럼 티어 없이 나올 수 있음
          let name = nameLink.text().trim();
          let tier = '미정';

          // 티어 파싱 시도: "쌍디(6)" 또는 별도 텍스트 확인
          const tierMatch = name.match(/^([^\(]+)\((.+)\)$/);
          let rawName = name;
          if (tierMatch) {
            rawName = tierMatch[1].trim();
            tier = tierMatch[2].trim();
          } else {
            // "김인호" 처럼 티어가 붙어있지 않은 경우, 옆의 텍스트에서 티어 탐색 가능성
            // 일단 value 어트리뷰트도 확인 (간혹 value에 티어 미포함 원본명이 있음)
            const valAttr = nameLink.attr('value');
            if (valAttr) rawName = valAttr.trim();
          }

          // Substitute name using metadata if available
          const playerHref = nameLink.attr('href');
          name = getPlayerName(rawName, playerHref);

          const rowText = $(row).text();
          let race = 'P';
          if (rowText.includes('Zerg')) race = 'Z';
          else if (rowText.includes('Terran')) race = 'T';
          else if (rowText.includes('Protoss')) race = 'P';

          playersToUpsert.push({
            name,
            university: univ.name === '연합팀' ? '무소속' : univ.name,
            tier: tier,
            race: race,
            sync_status: 'verified',
            last_synced_at: new Date().toISOString()
          });
        });

        if (playersToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('players')
            .upsert(playersToUpsert, { onConflict: 'name' });
          if (!upsertError) totalProcessed += playersToUpsert.length;
        }
        console.log(`✅ ${univ.name}: ${playersToUpsert.length} players synced.`);
      } catch (err) { console.error(`❌ Error syncing ${univ.name}:`, err.message); }
    }

    // --- Part 2: Top Men's BJ Sync (Men Board Ranking) ---
    console.log(`\n👨‍💻 Processing Top Men BJs...`);
    try {
      const menUrl = 'https://eloboard.com/men/bbs/board.php?bo_table=month_list';
      const response = await axios.get(menUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const menToUpsert = [];

      $('table tbody tr').each((i, row) => {
        if (i >= 30) return; // 상위 30명만 (효율성)
        const nameLink = $(row).find('a.p_name');
        if (nameLink.length === 0) return;

        let name = nameLink.text().trim();
        let tier = '미정';

        const nameMatch = name.match(/^([^\(]+)\((.+)\)$/);
        let rawName = name;
        if (nameMatch) {
          rawName = nameMatch[1].trim();
          tier = nameMatch[2].trim();
        } else {
          const valAttr = nameLink.attr('value');
          if (valAttr) rawName = valAttr.trim();
        }

        // Substitute name using metadata if available
        const playerHref = nameLink.attr('href');
        name = getPlayerName(rawName, playerHref);

        const rowText = $(row).text();
        let race = 'P';
        if (rowText.includes('Zerg')) race = 'Z';
        else if (rowText.includes('Terran')) race = 'T';
        else if (rowText.includes('Protoss')) race = 'P';

        menToUpsert.push({
          name,
          university: '무소속', // 남성 BJ는 기본 무소속 처리 (여성 리그 기준)
          tier: tier,
          race: race,
          sync_status: 'verified',
          last_synced_at: new Date().toISOString()
        });
      });

      if (menToUpsert.length > 0) {
        await supabase.from('players').upsert(menToUpsert, { onConflict: 'name' });
        totalProcessed += menToUpsert.length;
        console.log(`✅ Men's Board: ${menToUpsert.length} players synced.`);
      }
    } catch (err) { console.error(`❌ Men's sync error:`, err.message); }

    // Final Logging
    const duration = Date.now() - startTime;
    await supabase.from('sync_logs').insert({
      type: 'roster', status: 'success', processed_count: totalProcessed, duration_ms: duration
    });
    console.log(`\n✨ Final Sync Completed! Total: ${totalProcessed} players.`);
  } catch (err) { console.error('💥 Critical Sync Error:', err.message); }
}

syncRosters();
