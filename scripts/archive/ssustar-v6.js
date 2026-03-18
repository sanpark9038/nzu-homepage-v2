const axios = require('axios');
const cheerio = require('cheerio');
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
 * 🏟️ SSUSTAR COMPLETE PINPOINT SYNC (V6: Patient Engine)
 * - 수술대 전체 인원 자동 wr_id 추적 및 수집
 * - 30초 타임아웃 적용 (엘로보드 느린 서버 대응)
 * - 실패 시 즉각 보고용 로그 생성
 */

const START_DATE = '2025-01-01';

async function getWrId(name, gender) {
    const subdomain = gender === 'male' ? 'men' : 'women';
    const searchUrl = `https://eloboard.com/${subdomain}/bbs/board.php?bo_table=bj_list&stx=${encodeURIComponent(name)}`;
    
    try {
        const { data: html } = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        const $ = cheerio.load(html);
        // 검색 결과에서 첫 번째 선수의 링크 추출 (wr_id=XXX)
        const link = $('a[href*="wr_id="]').first().attr('href');
        if (link) {
            const match = link.match(/wr_id=(\d+)/);
            return match ? match[1] : null;
        }
    } catch (e) { return null; }
}

async function fetchMatchesWithPatience(name, gender, wr_id) {
    const subdomain = gender === 'male' ? 'men' : 'women';
    const url = `https://eloboard.com/${subdomain}/bbs/board.php?bo_table=bj_list&wr_id=${wr_id}`;
    
    try {
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000 // 넉넉하게 30초 (대표님 지시)
        });

        const $ = cheerio.load(html);
        const matches = [];
        
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const date = $(cells[0]).text().trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= START_DATE) {
                    const style = $(cells[0]).attr('style') || '';
                    const isWin = style.includes('#0CF') || style.includes('#00CCFF');
                    const oppRaw = $(cells[1]).text().trim();
                    const map = $(cells[2]).text().trim();
                    const note = $(cells[5]).text().trim();

                    matches.push({
                        player_name: name,
                        match_date: date,
                        opponent_name: oppRaw.split('(')[0],
                        is_win: isWin,
                        result_text: isWin ? '승' : '패',
                        map,
                        note,
                        gender
                    });
                }
            }
        });
        return matches;
    } catch (e) {
        throw new Error(`[${name}] 통신 지연/에러: ${e.message}`);
    }
}

async function runSsuStarSync() {
    const { data: players } = await supabase.from('players').select('*').eq('university', '수술대');
    if (!players) return;

    console.log(`🚀 [수술대] 21인 전원 무결성 진군 개시! (Timeout: 30s)`);
    
    const results = [];
    for (const player of players) {
        process.stdout.write(`🕵️ [${player.name}] wr_id 확인 중... `);
        const wr_id = await getWrId(player.name, player.gender);
        
        if (!wr_id) {
            console.log(`❌ wr_id를 찾을 수 없습니다.`);
            results.push({ name: player.name, status: 'wr_id_not_found', count: 0 });
            continue;
        }

        console.log(`(ID: ${wr_id}) 진입...`);
        try {
            const matches = await fetchMatchesWithPatience(player.name, player.gender, wr_id);
            if (matches.length > 0) {
                await supabase.from('eloboard_matches').delete().eq('player_name', player.name).gte('match_date', START_DATE);
                const { error } = await supabase.from('eloboard_matches').insert(matches);
                if (error) throw error;
                console.log(`  ✅ ${matches.length}건 정밀 저장 완료.`);
                results.push({ name: player.name, status: 'success', count: matches.length });
            } else {
                console.log(`  💤 2025년 이후 기록 없음.`);
                results.push({ name: player.name, status: 'no_data', count: 0 });
            }
        } catch (e) {
            console.log(`  🚨 ${e.message}`);
            results.push({ name: player.name, status: 'error', error: e.message });
        }
        await new Promise(r => setTimeout(r, 1500)); // 매너 타임
    }

    console.log(`\n🏁 [수술대] 작전 종료. 최종 보고를 준비합니다.`);
    console.log(JSON.stringify(results, null, 2));
}

runSsuStarSync();
