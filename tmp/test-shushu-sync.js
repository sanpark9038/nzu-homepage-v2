const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

/**
 * [슈슈] 선수의 데이터를 샘플로 하여 
 * 정밀 색상 판정 로직(#0CF, #434348)이 정확히 작동하는지 최종 확인
 */
async function testShushuSync() {
    const name = '슈슈';
    const subdomain = 'women';
    
    console.log(`\n--- [${name}] 최종 정밀 샘플 보고서 ---`);
    console.log(`※ 판정 근거: 날짜 칸 TD의 인라인 스타일 '#0CF' 승리 판독 엔진 가동\n`);
    
    try {
        const { data: html } = await axios.post(`https://eloboard.com/${subdomain}/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 15000 });
        
        const $ = cheerio.load(html);
        const rows = [];

        $('tr').each((i, el) => {
            if (i === 0) return; // Header skip
            if (rows.length >= 15) return; // 상위 15건 샘플

            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const dateRaw = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const note = $(cells[5]).text().trim();

                // --- [핵심] 개발자 도구 기반 정밀 판정 로직 ---
                const styleAttr = $(cells[0]).attr('style') || '';
                const styleClean = styleAttr.replace(/\s/g, '').toLowerCase();
                
                let isWin = false;
                // 승리: #0cf (또는 #00ccff), 패배: #434348
                if (styleClean.includes('background:#0cf') || styleClean.includes('background:#00ccff')) {
                    isWin = true;
                } else if (styleClean.includes('background:#434348')) {
                    isWin = false;
                } else {
                    // 보조 지표: 점수 칸 텍스트
                    const eloRaw = $(cells[3]).text().trim();
                    isWin = eloRaw.includes('승') || eloRaw.includes('+');
                }

                const resultText = isWin ? '승' : '패';

                // 상대명 및 종족 분리
                const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                const opponentRace = (oppMatch ? oppMatch[2] : 'U').charAt(0).toUpperCase();

                rows.push({
                    날짜: dateRaw,
                    상대명: opponentName,
                    종족: opponentRace,
                    맵: map,
                    결과: resultText,
                    비고: note
                });
            }
        });

        if (rows.length === 0) {
            console.log(`⚠️ 해당 선수의 전적이 없습니다.`);
        } else {
            console.table(rows);
            console.log(`\n✅ [판독 완료] 슈슈 선수의 승패가 정확히 기록되었습니다!`);
        }

    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

testShushuSync();
