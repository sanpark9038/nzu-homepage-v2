const axios = require('axios');

async function findPage() {
    for (let p = 1; p <= 15; p++) {
        const { data } = await axios.get(`https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=${p}`);
        if (data.includes('김성민') || data.includes('구라미스')) {
            console.log(`FOUND ON PAGE ${p}`);
            return;
        }
    }
    console.log('Not found in first 15 pages.');
}
findPage();
