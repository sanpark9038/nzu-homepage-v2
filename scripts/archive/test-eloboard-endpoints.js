const fs = require('fs');
const axios = require('axios');
const qs = require('querystring');

async function testEloboardEndpoints() {
    const baseUrl = 'https://eloboard.com/women/bbs';
    const playerName = '애공';
    const bId = 'eloboard';
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=223',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': '*/*',
        'Origin': 'https://eloboard.com'
    };
    
    const endpoints = [
        { url: `${baseUrl}/view_list.php`, data: { p_name: playerName, last_id: 0, b_id: bId } },
        { url: `${baseUrl}/view_list2.php`, data: { p_name: playerName, b_id: bId } },
        { url: `${baseUrl}/view_list3.php`, data: { p_name: playerName, b_id: bId } },
        { url: `${baseUrl}/view_mix_list.php`, data: { p_name: playerName, last_id: 0, b_id: bId } },
    ];
    
    for (const ep of endpoints) {
        const name = ep.url.split('/').pop();
        try {
            console.log(`\nTesting ${name} with params:`, ep.data);
            const r = await axios.post(ep.url, qs.stringify(ep.data), { headers, timeout: 10000 });
            const dataStr = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
            console.log(`Status: ${r.status}, Size: ${dataStr.length}`);
            
            if (dataStr.length > 10) {
                fs.writeFileSync(`.tmp/eloboard_test_${name}`, dataStr);
                console.log('Preview:', dataStr.replace(/\s+/g, ' ').substring(0, 400));
            } else {
                console.log('EMPTY RESPONSE:', JSON.stringify(dataStr));
            }
        } catch(e) {
            console.log(`ERROR ${name}:`, e.message);
        }
    }
}

testEloboardEndpoints();
