const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function probeStorkVariations() {
    const url = 'https://eloboard.com/men/bbs/view_list.php';
    const namesUnderTry = ['송병구', '송병구(P)', '송병구 (P)'];
    
    for (const name of namesUnderTry) {
        console.log(`📡 [시도] p_name: "${name}" ...`);
        const params = {
            bo_table: 'bj_list',
            wr_id: '16',
            p_name: name,
            wr_8: '',
            last_id: ''
        };

        try {
            const response = await axios.post(url, qs.stringify(params), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 10000
            });

            const $ = cheerio.load(response.data);
            const rows = $('tr');
            console.log(`   └ 결과: ${rows.length}개 행 발견`);
            
            if (rows.length > 0) {
                const firstDate = $(rows[0]).find('td').eq(0).text().trim();
                console.log(`   └ 첫 전적 날짜: ${firstDate}`);
                // 만약 성공하면 여기서 멈춤
                return;
            }
        } catch (e) {
            console.error(`   └ 에러: ${e.message}`);
        }
    }
}

probeStorkVariations();
