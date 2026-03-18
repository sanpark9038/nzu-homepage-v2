const axios = require('axios');
const qs = require('querystring');

async function verifyPName() {
    const names = ['지아송', '지아송(8)', '연블비', '연블비(6)'];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    for (const name of names) {
        console.log(`Testing p_name: [${name}]`);
        try {
            const { data } = await axios.post('https://eloboard.com/women/bbs/view_list.php', qs.stringify({
                p_name: name,
                last_id: 0,
                b_id: 'eloboard'
            }), { headers });
            
            console.log(`- Result length: ${data.length}`);
            if (data.length > 100) {
                console.log(`- SUCCESS for [${name}]`);
            }
        } catch(e) {
            console.log(`- FAILED [${name}]: ${e.message}`);
        }
    }
}

verifyPName();
