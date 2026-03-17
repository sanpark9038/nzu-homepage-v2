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
 * 🏟️ SSUSTAR BACK-TO-BASIC SYNC (안정성 최우선)
 * 로직:
 * 1. 선수별 프로필 페이지 직접 방문 (Pinpoint)
 * 2. HTML 테이블 파싱 (가장 안정적)
 * 3. 2025년 이후 데이터만 필터링
 * 4. 점수 제거, 승/패만 보관
 */

async function fetchProfileMatches(name, gender, wr_id) {
    const subdomain = gender === 'male' ? 'men' : 'women';
    const url = `https://eloboard.com/${subdomain}/bbs/board.php?bo_table=bj_list&wr_id=${wr_id}`;
    
    console.log(`\n🏟️ [${name}] 진군 중... (${url})`);
    
    try {
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });

        const $ = cheerio.load(html);
        const matches = [];
        
        // 프로필 페이지 하단 테이블 파싱
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const date = $(cells[0]).text().trim();
                // 날짜 형식 검사 (2025-01-01 이상)
                if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2025-01-01') {
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

        console.log(`  ✅ ${matches.length}건 확보 완료.`);
        return matches;
    } catch (e) {
        console.error(`  ❌ [${name}] 통신 에러: ${e.message}`);
        return [];
    }
}

async function runSsuStarSync() {
    // 수술대 주요 인원 (Pinpoint ID 매칭)
    const targets = [
        { name: '나예리', gender: 'female', wr_id: '177' },
        { name: '신상문', gender: 'male', wr_id: '102' },
        { name: '연애인', gender: 'female', wr_id: '373' },
        { name: '주서리', gender: 'female', wr_id: '566' },
        { name: '밍가', gender: 'female', wr_id: '252' }
    ];

    console.log("🚀 SSUSTAR PINPOINT SYNC (RECOVERED)");

    for (const target of targets) {
        const matches = await fetchProfileMatches(target.name, target.gender, target.wr_id);
        if (matches.length > 0) {
            // 기존 2025년 이후 데이터 삭제 후 재삽입 (중복 방지 및 갱신)
            await supabase.from('eloboard_matches')
                .delete()
                .eq('player_name', target.name)
                .gte('match_date', '2025-01-01');

            const { error } = await supabase.from('eloboard_matches').insert(matches);
            if (error) console.error(`    ❌ DB Error: ${error.message}`);
            else console.log(`    💾 DB 저장 성공.`);
        }
        // 서버 매너 타임
        await new Promise(r => setTimeout(r, 1000));
    }
    console.log("\n🏁 RECOVERY COMPLETED.");
}

runSsuStarSync();
