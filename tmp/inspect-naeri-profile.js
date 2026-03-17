const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * 나예리 선수의 프로필 페이지(wr_id=177)에서 직접 전적 테이블을 추출합니다.
 * 이 페이지는 대표님이 지정하신 '테란' 전용 페이지입니다.
 */
async function inspectNaeriProfilePage() {
    const url = `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=177`;
    console.log(`\n--- [나예리] 프로필 페이지(wr_id=177) 분석 중 ---`);
    
    try {
        const { data: html } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(html);
        
        // 전적 테이블이 포함된 div나 table을 찾습니다.
        // 보통 '여성밀리전적'이라는 텍스트 근처에 있습니다.
        const matches = [];
        
        // 모든 tr을 돌며 날짜 형식(YYYY-MM-DD)이 있는지 확인합니다.
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const dateRaw = $(cells[0]).text().trim();
                // 날짜 형식 체크 (예: 2025-01-05)
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
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
                    }

                    matches.push({
                        날짜: dateRaw,
                        상대: oppRaw,
                        맵: map,
                        결과: isWin ? '승' : '패',
                        비고: note
                    });
                }
            }
        });

        if (matches.length === 0) {
            console.log("⚠️ 프로필 페이지에서 직접적인 전적 테이블을 찾지 못했습니다. (동적 로딩 가능성)");
        } else {
            // 2025년 데이터만 필터링해서 보여줌
            const matches2025 = matches.filter(m => m.날짜.startsWith('2025'));
            console.log(`✅ 프로필 페이지에서 전적 ${matches.length}건 발견! (2025년: ${matches2025.length}건)`);
            console.table(matches2025.slice(0, 20));
        }

    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

inspectNaeriProfilePage();
