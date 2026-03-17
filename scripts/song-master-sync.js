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

async function syncSongFullHistory() {
    console.log(`🚀 [송병구] 총사령관 고속 전적 수집 엔진 가동...`);
    
    let page = 1;
    let keepGoing = true;
    let allMatches = [];

    try {
        while (keepGoing) {
            console.log(`📡 [페이지 ${page}] 데이터 팩토리 가동 중...`);
            
            const response = await axios.post('https://eloboard.com/men/bbs/view_list.php', 
                qs.stringify({ p_name: '송병구', last_id: page.toString() }), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 30000
                }
            );

            const $ = cheerio.load(response.data);
            const rows = $('tr');

            if (rows.length === 0) {
                console.log(`🏁 더 이상 데이터가 없습니다. (페이지: ${page})`);
                break;
            }

            let pageCount2025 = 0;
            rows.each((i, el) => {
                const tds = $(el).find('td');
                if (tds.length < 6) return;

                const date = $(tds[0]).text().trim();
                // 2024년 데이터가 보이면 중단 신호를 보냅니다.
                if (date.startsWith('2024')) {
                    keepGoing = false;
                    return;
                }

                if (date.startsWith('2025') || date.startsWith('2026')) {
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
                    pageCount2025++;
                }
            });

            console.log(`   └ ${page}페이지에서 ${pageCount2025}건의 2025+ 전적 확보`);
            page++;
            
            // 안전장치 (총사령관님 경기가 너무 많아서 100페이지까지 제한)
            if (page > 100) break;
        }

        if (allMatches.length > 0) {
            console.log(`\n🏆 [수집 완료] 총 ${allMatches.length}건의 전적을 확보했습니다!`);
            
            // DB 업데이트
            console.log(`💾 DB에 박제 중...`);
            await supabase.from('eloboard_matches')
                .delete()
                .eq('player_name', '송병구')
                .gte('match_date', '2025-01-01');

            const { error } = await supabase.from('eloboard_matches').insert(allMatches);
            if (error) throw error;

            console.log(`✨ 총사령관 송구 선수의 역사가 완벽하게 DB에 저장되었습니다!`);
        } else {
            console.log(`🤷‍♂️ 2025년 이후 데이터를 단 한 건도 찾지 못했습니다. 체크가 필요합니다.`);
        }

    } catch (e) {
        console.error(`🚨 작전 중 예상치 못한 에러 발생: ${e.message}`);
    }
}

syncSongFullHistory();
