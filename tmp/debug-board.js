const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

/**
 * bj_list의 실제 테이블 구조를 분석합니다.
 */
async function debugBoardHtml() {
    try {
        const { data: html } = await axios.get(`https://eloboard.com/women/bbs/board.php?bo_table=bj_list`, { headers: HEADERS });
        const $ = cheerio.load(html);
        
        console.log("--- bj_list Table Structure Debug ---");
        
        // 게시판 행(tr) 하나를 통째로 보고 싶습니다.
        $('tr').each((i, el) => {
            if (i > 5) return;
            console.log(`[TR ${i}]`);
            console.log($(el).text().trim().replace(/\s+/g, ' '));
        });

    } catch (e) {
        console.error(e);
    }
}

debugBoardHtml();
