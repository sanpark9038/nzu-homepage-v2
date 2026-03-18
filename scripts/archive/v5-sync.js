const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
let dotenv;
try {
    dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
} catch (e) {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * 🏟️ SSUSTAR V5 Precision Engine
 * 전략:
 * 1. p_name 시도 (이름 / 이름(R) 교차 검증)
 * 2. AJAX 응답에서 2025년 이후 데이터만 추출
 * 3. 승패 판독: #00CCFF(승) vs #434348(패)
 * 4. 진행 상황 10초마다 브리핑
 */

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

async function fetchMatches(name, gender, race) {
    const subdomain = gender === 'male' ? 'men' : 'women';
    const url = `https://eloboard.com/${subdomain}/bbs/view_list.php`;
    
    // 시도용 이름 목록 (기본, (Z), (T), (P))
    const nameVariations = [name, `${name}(${race})`, `${name}(Z)`, `${name}(T)`, `${name}(P)`];
    let allMatches = [];
    
    for (const pName of nameVariations) {
        let lastId = 1;
        let hasMore = true;
        let pNameMatches = [];
        
        console.log(`  🔍 Trying [${pName}]...`);
        
        // 페이지 2개 정도만 먼저 찔러봐서 데이터가 있는지 확인
        for (let p = 1; p <= 10; p++) {
            try {
                const { data: html } = await axios.post(url, qs.stringify({
                    p_name: pName,
                    last_id: lastId,
                    b_id: 'eloboard'
                }), { headers: HEADERS });

                if (!html || html.length < 500) break;

                const $ = cheerio.load(html);
                const rows = $('tr');
                if (rows.length === 0) break;

                let pageHas2025 = false;
                rows.each((i, el) => {
                    const cells = $(el).find('td');
                    if (cells.length >= 6) {
                        const date = $(cells[0]).text().trim();
                        if (date >= '2025-01-01') {
                            const style = $(cells[0]).attr('style') || '';
                            const isWin = style.includes('#0CF') || style.includes('#00CCFF');
                            const oppRaw = $(cells[1]).text().trim();
                            const map = $(cells[2]).text().trim();
                            const note = $(cells[5]).text().trim();

                            pNameMatches.push({
                                player_name: name,
                                match_date: date,
                                opponent_name: oppRaw.split('(')[0],
                                is_win: isWin,
                                result_text: isWin ? '승' : '패',
                                map,
                                note,
                                gender
                            });
                            pageHas2025 = true;
                        }
                    }
                });

                const nextBtn = $('button.btn_more, a.more');
                if (nextBtn.length > 0) {
                    lastId = nextBtn.attr('id');
                    if (!pageHas2025 && p > 3) break; // 3페이지 넘게 2025가 안 나오면 중단
                } else {
                    break;
                }
            } catch (e) { break; }
        }

        if (pNameMatches.length > 0) {
            allMatches = pNameMatches;
            console.log(`    ✅ Found ${allMatches.length} matches for [${pName}]`);
            break; 
        }
    }
    return allMatches;
}

async function runSsuStarSync() {
    const players = [
        {name: '나예리', gender: 'female', race: 'T'},
        {name: '신상문', gender: 'male', race: 'T'},
        {name: '연애인', gender: 'female', race: 'P'}
        // 일단 핵심 3인 먼저 테스트
    ];

    console.log("🚀 SSUSTAR V5 EMERGENCY SYNC START");
    
    for (const player of players) {
        const matches = await fetchMatches(player.name, player.gender, player.race);
        if (matches.length > 0) {
            // DB 저장 로직 (INSERT)
            const { error } = await supabase.from('eloboard_matches').upsert(matches, { onConflict: 'player_name,match_date,opponent_name,map,note' });
            if (error) console.error(`    ❌ DB Error: ${error.message}`);
        } else {
            console.log(`    ⚠️ No 2025+ matches found for ${player.name}`);
        }
    }
    console.log("🏁 SYNC EFFORT COMPLETED. REPORTING BACK.");
}

runSsuStarSync();
