const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

/**
 * [슈슈] 선수의 2024-12-28 데이터를 집중적으로 추출
 */
async function inspectShushuDec28() {
    const name = '슈슈';
    const subdomain = 'women';
    const TARGET_DATE = '2024-12-28';
    
    console.log(`\n--- [${name}] 2024-12-28 정밀 데이터 보고서 ---`);
    
    try {
        const { data: html } = await axios.post(`https://eloboard.com/${subdomain}/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 15000 });
        
        const $ = cheerio.load(html);
        const rows = [];

        $('tr').each((i, el) => {
            if (i === 0) return;

            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const dateRaw = $(cells[0]).text().trim();
                
                // 12월 28일 데이터만 필터링
                if (dateRaw !== TARGET_DATE) return;

                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const note = $(cells[5]).text().trim();

                const styleAttr = $(cells[0]).attr('style') || '';
                const styleClean = styleAttr.replace(/\s/g, '').toLowerCase();
                
                let isWin = false;
                if (styleClean.includes('background:#0cf') || styleClean.includes('background:#00ccff')) {
                    isWin = true;
                } else if (styleClean.includes('background:#434348')) {
                    isWin = false;
                } else {
                    const eloRaw = $(cells[3]).text().trim();
                    isWin = eloRaw.includes('승') || eloRaw.includes('+');
                }

                const resultText = isWin ? '승' : '패';
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
            console.log(`⚠️ 해당 날짜(${TARGET_DATE})의 데이터가 없습니다.`);
        } else {
            console.table(rows);
            console.log(`\n✅ 12월 28일 총 ${rows.length}건의 데이터를 완벽하게 추출했습니다.`);
        }

    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

inspectShushuDec28();
