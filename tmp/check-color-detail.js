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
    
    console.log(`\n--- [${name}] 데이터 파싱 상세 디버깅 (전체 소스 분석) ---`);
    
    try {
        const { data: html } = await axios.post(`https://eloboard.com/${subdomain}/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 15000 });
        
        const $ = cheerio.load(html);

        // 첫 번째 데이터 행(tr)의 전체 HTML 구조 출력
        const firstRow = $('tr').eq(1); 
        console.log("\n[1번째 행 HTML 구조]:");
        console.log($.html(firstRow));

        // 두 번째 데이터 행(tr)의 전체 HTML 구조 출력
        const secondRow = $('tr').eq(2);
        console.log("\n[2번째 행 HTML 구조]:");
        console.log($.html(secondRow));

        // 배경색을 가진 요소가 tr인지, 아니면 td인지 확인
        console.log("\n[내부 td들 속성 확인]:");
        firstRow.find('td').each((i, td) => {
            console.log(`td[${i}] bgcolor: ${$(td).attr('bgcolor') || '없음'}, style: ${$(td).attr('style') || '없음'}`);
        });

    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

testSync();
