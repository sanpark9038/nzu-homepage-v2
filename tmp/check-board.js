const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

/**
 * bj_list 게시판 자체를 긁어서 최근 등록된 선수들을 확인합니다.
 */
async function checkBjListBoard() {
    console.log(`\n--- 엘로보드 여성부 게시판 (bj_list) 최신 글 목록 ---`);
    try {
        const { data: html } = await axios.get(`https://eloboard.com/women/bbs/board.php?bo_table=bj_list`, { headers: HEADERS });
        const $ = cheerio.load(html);
        
        const list = [];
        // 게시판 리스트의 행(tr)을 찾습니다. 보통 list-item 또는 특정 구조입니다.
        $('.td_subject a').each((i, el) => {
            if (i >= 15) return;
            const title = $(el).text().trim();
            list.push({ 제목: title });
        });

        console.table(list);

    } catch (e) {
        console.error(e);
    }
}

checkBjListBoard();
