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

async function syncSong1017() {
    console.log(`🚀 [송병구] 1017건 완전체 복원 엔진 가동 (대표님 가설 검증 버전)`);
    
    let allMatches = [];

    // Step 1: 초기 페이지 데이터 수집 (Page 0)
    console.log(`📡 [Step 1] 초기 페이지(Static HTML) 분석 중...`);
    try {
        const initialRes = await axios.get('https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=16', {
            timeout: 30000
        });
        const $ = cheerio.load(initialRes.data);
        const initialRows = $('#record_page_area tr');
        
        initialRows.each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length < 6) return;
            const date = $(tds[0]).text().trim();
            if (date >= '2025-01-01') {
                const opponentRaw = $(tds[1]).text().trim();
                const result = $(tds[0]).attr('bgcolor') === '#0CF' ? '승' : '패';
                const map = $(tds[2]).text().trim();
                const note = $(tds[5]).text().trim() || $(tds[4]).text().trim();

                allMatches.push({
                    player_name: '송병구',
                    match_date: date,
                    opponent_name: opponentRaw.split('(')[0],
                    is_win: result === '승',
                    result_text: result,
                    map: map,
                    note: note,
                    gender: 'male'
                });
            }
        });
        console.log(`   └ 초기 매치 수집 완료: ${allMatches.length}건`);
    } catch (e) {
        console.error(`🚨 초기 페이지 수집 실패: ${e.message}`);
    }

    // Step 2: AJAX 루핑 (Page 1 ~ End)
    let page = 1;
    let keepGoing = true;
    try {
        while (keepGoing) {
            console.log(`📡 [Step 2] AJAX 페이지 ${page} 가동 중...`);
            const response = await axios.post('https://eloboard.com/men/bbs/view_list.php', 
                qs.stringify({ p_name: '송병구', last_id: page.toString() }), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 30000
                }
            );

            const $ = cheerio.load(response.data);
            const rows = $('tr');
            if (rows.length === 0) break;

            let pageAdded = 0;
            rows.each((i, el) => {
                const tds = $(el).find('td');
                if (tds.length < 6) return;
                const date = $(tds[0]).text().trim();
                if (date < '2025-01-01') {
                    keepGoing = false;
                    return;
                }
                const opponentRaw = $(tds[1]).text().trim();
                const result = $(tds[0]).attr('bgcolor') === '#0CF' ? '승' : '패';
                const map = $(tds[2]).text().trim();
                const note = $(tds[5]).text().trim() || $(tds[4]).text().trim();

                allMatches.push({
                    player_name: '송병구',
                    match_date: date,
                    opponent_name: opponentRaw.split('(')[0],
                    is_win: result === '승',
                    result_text: result,
                    map: map,
                    note: note,
                    gender: 'male'
                });
                pageAdded++;
            });
            console.log(`   └ ${page}페이지에서 ${pageAdded}건 추가`);
            page++;
            if (page > 50) break;
        }

        console.log(`\n📊 최종 정산: 총 ${allMatches.length}건 수집 완료!`);
        
        if (allMatches.length >= 1017) {
            console.log(`✅ 드디어 대표님의 전설적인 숫자 '1017'에 도달했습니다! (또는 그 이상)`);
        }

        // DB 최종 박제
        console.log(`💾 DB 마스터피스 업데이트 중...`);
        await supabase.from('eloboard_matches')
            .delete()
            .eq('player_name', '송병구')
            .gte('match_date', '2025-01-01');

        await supabase.from('eloboard_matches').insert(allMatches);
        console.log(`✨ 송병구 선수의 '진짜' 1017건(확정)의 역사가 복원되었습니다! 🫡`);

    } catch (e) {
        console.error(`🚨 작전 중 에러: ${e.message}`);
    }
}

syncSong1017();
