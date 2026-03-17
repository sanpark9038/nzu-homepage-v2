const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');
let dotenv;
try {
    dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
} catch (e) {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncParkSangHyun() {
    console.log(`🚀 [박상현] 짭제 박상현 선수 고속 전적 수집 엔진 가동...`);
    
    let allMatches = [];
    const player_name = '박상현';
    // 남성 선수는 -1, 0, 1... 순서로 페이지가 넘어가는 경향이 있음
    const pages = ['-1', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

    for (const pageId of pages) {
        console.log(`📡 [Page ${pageId}] 데이터 팩토리 가동 중...`);
        try {
            const response = await axios.post('https://eloboard.com/men/bbs/view_list.php', 
                qs.stringify({ p_name: player_name, last_id: pageId }), 
                {
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    timeout: 20000
                }
            );

            const $ = cheerio.load(response.data);
            const rows = $('tr');
            if (rows.length === 0) {
                console.log(`   🏁 더 이상 데이터가 없습니다.`);
                break;
            }

            let pageCount = 0;
            let foundOldMatch = false;

            rows.each((i, el) => {
                const tds = $(el).find('td');
                if (tds.length < 6) return;
                
                const date = $(tds[0]).text().trim();
                if (date >= '2025-01-01') {
                    const opponentRaw = $(tds[1]).text().trim();
                    const result = $(tds[0]).attr('bgcolor') === '#0cf' || $(tds[0]).attr('bgcolor') === '#0CF' ? '승' : '패';
                    const map = $(tds[2]).text().trim();
                    const note = $(tds[5]).text().trim() || $(tds[4]).text().trim();

                    allMatches.push({
                        player_name: player_name,
                        match_date: date,
                        opponent_name: opponentRaw.split('(')[0],
                        is_win: result === '승',
                        result_text: result,
                        map: map,
                        note: note,
                        gender: 'male'
                    });
                    pageCount++;
                } else {
                    foundOldMatch = true;
                }
            });
            
            console.log(`   └ ${pageCount}건의 2025+ 전적 확보 (누적: ${allMatches.length}건)`);
            if (foundOldMatch) {
                console.log(`   🛑 2025년 이전 데이터 발견으로 수집 종료.`);
                break;
            }
        } catch (e) {
            console.error(`   🚨 [Page ${pageId}] 실패: ${e.message}`);
        }
    }

    // 중복 제거
    const uniqueMap = new Map();
    allMatches.forEach(m => {
        const key = `${m.match_date}|${m.opponent_name}|${m.map}|${m.note}`;
        uniqueMap.set(key, m);
    });
    const finalMatches = Array.from(uniqueMap.values());

    console.log(`\n📊 최종 정산:`);
    console.log(`- 수집 데이터: ${allMatches.length}건`);
    console.log(`- 중복 제거 후: ${finalMatches.length}건`);

    // DB 박제
    if (finalMatches.length > 0) {
        console.log(`💾 DB에 박상현 선수의 역사를 박제 중...`);
        await supabase.from('eloboard_matches').delete().eq('player_name', player_name).gte('match_date', '2025-01-01');
        const { error } = await supabase.from('eloboard_matches').insert(finalMatches);
        
        if (error) {
            console.error(`🚨 DB 저장 에러: ${error.message}`);
        } else {
            console.log(`✨ [박상현] ${finalMatches.length}건의 전적이 DB에 완벽히 저장되었습니다! 🫡`);
        }
    } else {
        console.log(`🤔 수집된 데이터가 없습니다. p_name이나 파라미터를 다시 확인해야 할 수도 있습니다.`);
    }
}

syncParkSangHyun();
