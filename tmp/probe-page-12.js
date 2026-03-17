const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function probePage12() {
    console.log(`🔍 [송병구] Page 12 정밀 수색 중...`);
    
    try {
        const response = await axios.post('https://eloboard.com/men/bbs/view_list.php', 
            qs.stringify({ p_name: '송병구', last_id: '12' }), 
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 
                    'X-Requested-With': 'XMLHttpRequest',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 30000
            }
        );

        console.log(`📡 응답 데이터 길이: ${response.data.length} bytes`);
        const $ = cheerio.load(response.data);
        const rows = $('tr');
        console.log(`✅ ${rows.length}개 행 발견`);

        rows.each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length >= 6) {
                console.log(`[${i}] ${tds.eq(0).text().trim()} | ${tds.eq(1).text().trim()} | ${tds.eq(2).text().trim()}`);
            }
        });

    } catch (e) {
        console.error(`🚨 에러: ${e.message}`);
    }
}

probePage12();
