const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');

async function debugYeonAeIn() {
    const url = `https://eloboard.com/women/bbs/view_list.php`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    try {
        const { data } = await axios.post(url, qs.stringify({
            p_name: '연애인',
            last_id: 1,
            b_id: 'eloboard'
        }), { headers });

        fs.writeFileSync('c:/Users/NZU/Desktop/nzu-homepage/tmp/yeonaein_ajax.html', data);
        console.log(`Saved AJAX output for [연애인] to tmp/yeonaein_ajax.html (Length: ${data.length})`);
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}
debugYeonAeIn();
