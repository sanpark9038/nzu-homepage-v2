const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function testSync() {
    const name = '엄보리';
    const subdomain = 'women';
    
    console.log(`\n--- [${name}] 데이터 파싱 샘플 검증 (색상 속성 정밀 분석) ---`);
    
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
            if (rows.length >= 10) return;

            const bgcolor = $(el).attr('bgcolor') || '없음';
            const style = $(el).attr('style') || '없음';
            const date = $($(el).find('td')[0]).text().trim();
            const opp = $($(el).find('td')[1]).text().trim();

            rows.push({
                순번: i,
                날짜: date,
                상대: opp,
                'bgcolor속성': bgcolor,
                'style속성': style
            });
        });

        console.table(rows);

    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

testSync();
