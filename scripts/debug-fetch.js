const axios = require('axios');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

async function debugPost(url) {
    try {
        console.log(`Fetching ${url}...`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const html = iconv.decode(response.data, 'cp949');
        const $ = cheerio.load(html);
        
        console.log('Title:', $('title').text().trim());
        
        // Find match table
        // SSUSTAR analysis said it looks for a cell with "결과" header
        let matchTableFound = false;
        $('table').each((i, table) => {
            const tableText = $(table).text();
            if (tableText.includes('결과')) {
                console.log(`--- Potential Match Table ${i + 1} ---`);
                matchTableFound = true;
                $(table).find('tr').each((j, tr) => {
                    const rowText = $(tr).text().trim().replace(/\s+/g, ' ');
                    console.log(`Row ${j+1}: ${rowText}`);
                });
            }
        });
        
        if (!matchTableFound) {
            console.log('No table with "결과" found. Printing table summaries:');
            $('table').each((i, table) => {
                const rows = $(table).find('tr').length;
                const text = $(table).text().trim().slice(0, 100).replace(/\s+/g, ' ');
                console.log(`Table ${i}: ${rows} rows, Snippet: ${text}`);
            });
        }
    } catch (e) {
        console.error(e.message);
    }
}

debugPost('https://eloboard.com/univ/bbs/board.php?bo_table=input_team&wr_id=1625');
