const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function debugSongCount() {
    console.log(`🔍 [송병구] 전적 카운트 정밀 재검색 (1017건 가설 검증)...`);
    
    let allMatches = [];
    // 넉넉하게 20페이지까지 훑어봅니다.
    for (let page = 1; page <= 20; page++) {
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
        if (rows.length === 0) break;

        let pageMatches = 0;
        let pageMinDate = '';
        let pageMaxDate = '';

        rows.each((i, el) => {
            const date = $(el).find('td').eq(0).text().trim();
            if (date.startsWith('20')) {
                if (!pageMaxDate) pageMaxDate = date;
                pageMinDate = date;

                if (date >= '2025-01-01') {
                    allMatches.push(date);
                    pageMatches++;
                }
            }
        });

        console.log(`📄 Page ${page}: ${rows.length} rows | 2025+ matches: ${pageMatches} | Range: ${pageMaxDate} ~ ${pageMinDate}`);
        
        // 2024년 데이터가 너무 많이 나오기 시작하면 중단 (하지만 충분히 더 봅니다)
        if (pageMinDate < '2024-10-01' && pageMatches === 0) break;
    }

    console.log(`\n📊 최종 검증 결과:`);
    console.log(`- 수집된 2025년 이후 전적 총합: ${allMatches.length}건`);
    if (allMatches.length === 1017) {
        console.log(`✅ 와우! 대표님의 1017건이 정확했습니다! 제가 놓친 부분이 있었네요.`);
    } else {
        console.log(`🤔 현재 스크립트로는 ${allMatches.length}건이 나옵니다. 차이가 ${1017 - allMatches.length}건 발생하네요.`);
    }
}

debugSongCount();
