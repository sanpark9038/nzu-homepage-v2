const axios = require('axios');
const cheerio = require('cheerio');

async function findInternalNames() {
    const players = [
        { name: '지아송', id: '981' },
        { name: '아링', id: '953' },
        { name: '찡찡시아', id: '955' },
        { name: '정연이', id: '424' }
    ];

    for (const p of players) {
        console.log(`Checking ${p.name} (ID: ${p.id})...`);
        try {
            const { data } = await axios.get(`https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=${p.id}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const match = data.match(/p_name\s*:\s*["']([^"']+)["']/);
            if (match) {
                console.log(`- Internal p_name: [${match[1]}]`);
            } else {
                console.log(`- p_name NOT FOUND`);
                // Dump some context
                const idx = data.indexOf('view_list.php');
                if (idx > -1) {
                    console.log('  Context:', data.substring(idx, idx + 200).replace(/\s+/g, ' '));
                }
            }
        } catch (e) {
            console.log(`- ERROR: ${e.message}`);
        }
    }
}

findInternalNames();
