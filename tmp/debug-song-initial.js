const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function debugInitialPage() {
    console.log(`📡 [송병구] 초기 프로필 페이지 데이터 분석 중...`);
    
    try {
        const response = await axios.get('https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=16', {
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const rows = $('#record_page_area tr');
        console.log(`✅ 초기 페이지에서 ${rows.length}개 행 발견`);

        let count2025 = 0;
        let maxDate = '';
        let minDate = '';

        rows.each((i, el) => {
            const date = $(el).find('td').eq(0).text().trim();
            if (date.startsWith('20')) {
                if (!maxDate) maxDate = date;
                minDate = date;
                if (date >= '2025-01-01') count2025++;
            }
        });

        console.log(`📊 초기 페이지 분석 결과:`);
        console.log(`- 2025+ 전적 수: ${count2025}건`);
        console.log(`- 날짜 범위: ${maxDate} ~ ${minDate}`);
        
        return count2025;
    } catch (e) {
        console.error(`🚨 에러: ${e.message}`);
    }
}

debugInitialPage();
