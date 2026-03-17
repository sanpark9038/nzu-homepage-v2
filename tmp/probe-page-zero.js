const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function probeMissingPage() {
    console.log(`🔍 [송병구] 사라진 "Page 0" 혹은 "Recent Page" 정밀 수색 중...`);
    
    // 테스트할 last_id 후보들
    const candidates = ['0', '', 'recent', '-1'];
    
    for (const lid of candidates) {
        console.log(`📡 last_id="${lid}" 테스트 중...`);
        try {
            const response = await axios.post('https://eloboard.com/men/bbs/view_list.php', 
                qs.stringify({ p_name: '송병구', last_id: lid }), 
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
                    timeout: 10000
                }
            );

            const $ = cheerio.load(response.data);
            const rows = $('tr');
            if (rows.length > 0) {
                const firstDate = rows.first().find('td').eq(0).text().trim();
                const lastDate = rows.last().find('td').eq(0).text().trim();
                console.log(`   ✅ 발견! ${rows.length}개 행 수집됨. 범위: ${firstDate} ~ ${lastDate}`);
            } else {
                console.log(`   ❌ 데이터 없음.`);
            }
        } catch (e) {
            console.log(`   🚨 에러: ${e.message}`);
        }
    }
}

probeMissingPage();
