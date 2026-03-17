const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function testFinalSync(name, subdomain = 'women') {
    console.log(`\n--- [${name}] 2024-2025년 정밀 샘플 보고서 (날짜 필터 없음) ---`);
    console.log(`※ 2025년 데이터가 부족하여 모든 연도 전적으로 샘플 구성\n`);
    
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
            if (rows.length >= 15) return;

            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const dateRaw = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const note = $(cells[5]).text().trim();

                const style = $(cells[0]).attr('style') || '';
                const isWin = style.includes('#D9EDF7');
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

        console.table(rows);
        console.log(`\n✅ 총 ${rows.length}건 수집 완료! (중복 줄 유지 원칙 적용)`);
    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

// 으냉이 선수의 모든 전적을 샘플로 보여드립니다.
testFinalSync('으냉이');
