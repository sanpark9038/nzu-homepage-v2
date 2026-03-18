const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');
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
 * 🏟️ SHIN SANG MOON (ID: 102) FULL RECONSTRUCTION
 * - AJAX를 통해 과거 전적까지 한 번에 싹 긁어모음 (더보기 로직 구현)
 */

const WR_ID = '102';
const START_DATE = '2025-01-01';

async function fetchShinFullHistory() {
    console.log(`🚀 [신상문] 2025년 이후 전적 대공습 개시!`);
    
    let allMatches = [];
    let lastId = '';

    // 첫 페이지 수집 (Pinpoint)
    try {
        const url = `https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=${WR_ID}`;
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 60000 });
        const $ = cheerio.load(html);
        
        parseMatches($, allMatches);
        
        // 2025년 데이터가 더 있을 수 있으므로 AJAX 더보기 루프 가동
        // (엘로보드 특성상 last_id가 날짜 기반이거나 특정 순번임)
        // 여기서는 안전하게 AJAX view_list.php를 호출하여 2025년이 안 나올 때까지 반복
        
        console.log(`  ✅ 1페이지 완료. (${allMatches.length}건 확보)`);
        
        // AJAX 호출을 위한 last_id 추출 (보통 마지막 행의 날짜 혹은 ID)
        // 하지만 신상문 선수는 워낙 전적이 많아 AJAX로 과거를 더 파야 함
        // 2페이지부터 수지 (wr_8 파라미터가 연도 필터일 가능성 높음)
        
        for (let page = 1; page <= 5; page++) { // 넉넉하게 5페이지 (약 150~200건)
            const ajaxUrl = `https://eloboard.com/men/bbs/view_list.php`;
            const postData = qs.stringify({
                bo_table: 'bj_list',
                wr_id: WR_ID,
                p_name: '신상문',
                wr_8: '2025', // 2025년 필터 (추측)
                page: page + 1
            });

            const { data: ajaxHtml } = await axios.post(ajaxUrl, postData, {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': url
                },
                timeout: 30000
            });

            const $ajax = cheerio.load(ajaxHtml);
            const beforeCount = allMatches.length;
            parseMatches($ajax, allMatches);
            
            if (allMatches.length === beforeCount) {
                console.log(`  🏁 더 이상의 2025년 전적이 없습니다.`);
                break;
            }
            console.log(`  ✅ AJAX ${page + 1}페이지 완료. (누적 ${allMatches.length}건)`);
        }

        if (allMatches.length > 0) {
            // 날짜순 정렬 및 중복 제거
            const uniqueMatches = Array.from(new Set(allMatches.map(m => JSON.stringify(m))))
                .map(s => JSON.parse(s))
                .filter(m => m.match_date >= START_DATE);

            console.log(`  💾 총 ${uniqueMatches.length}건의 무결성 데이터를 DB에 박제합니다.`);
            
            await supabase.from('eloboard_matches').delete().eq('player_name', '신상문').gte('match_date', START_DATE);
            const { error } = await supabase.from('eloboard_matches').insert(uniqueMatches);
            if (error) throw error;
            console.log(`  🏆 신상문 역사 복원 성공!`);
        }

    } catch (e) {
        console.error(`  🚨 작전 실패: ${e.message}`);
    }
}

function parseMatches($, matches) {
    $('tr').each((i, el) => {
        const cells = $(el).find('td');
        if (cells.length >= 6) {
            const date = $(cells[0]).text().trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                const style = $(cells[0]).attr('style') || '';
                const isWin = style.includes('#0CF') || style.includes('#00CCFF');
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const note = $(cells[5]).text().trim();

                matches.push({
                    player_name: '신상문',
                    match_date: date,
                    opponent_name: oppRaw.split('(')[0],
                    is_win: isWin,
                    result_text: isWin ? '승' : '패',
                    map,
                    note,
                    gender: 'male'
                });
            }
        }
    });
}

fetchShinFullHistory();
