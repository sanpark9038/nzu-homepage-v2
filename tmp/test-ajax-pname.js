const axios = require('axios');
const qs = require('querystring');

async function testAjax(name, subdomain) {
    console.log(`\nTesting AJAX for [${name}] in [${subdomain}]...`);
    const url = `https://eloboard.com/${subdomain}/bbs/view_list.php`;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };

    try {
        const { data } = await axios.post(url, qs.stringify({
            p_name: name,
            last_id: 1,
            b_id: 'eloboard'
        }), { headers });

        console.log(`Length: ${data.length}`);
        if (data.length > 50) {
            console.log(`Success! Matches found for [${name}]`);
        } else {
            console.log(`Failure. Empty or short response for [${name}]`);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
    }
}

async function run() {
    await testAjax('연애인', 'women');
    await testAjax('연애인(Z)', 'women');
    await testAjax('신상문', 'men');
}
run();
