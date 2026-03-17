const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

async function checkRecentMatches() {
    console.log(`\n--- 엘로보드 여성부 최근 전적 리스트 (최신 30건) ---`);
    try {
        // 전체 리스트 페이지 (bj_list)에서 최신 등록된 전적들을 확인
        const { data: html } = await axios.get(`https://eloboard.com/women/bbs/board.php?bo_table=bj_list`, { headers: HEADERS });
        const $ = cheerio.load(html);
        
        const matches = [];
        $('tr').each((i, el) => {
            if (i === 0) return;
            if (matches.length >= 20) return;

            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const date = $(cells[0]).text().trim();
                const player = $(cells[1]).text().trim();
                const opp = $(cells[2]).text().trim();
                const map = $(cells[3]).text().trim();
                const note = $(cells[5]).text().trim();

                matches.push({ 날짜: date, 선수: player, 상대: opp, 맵: map, 비고: note });
            }
        });

        console.table(matches);
    } catch (e) {
        console.error(e);
    }
}

checkRecentMatches();
