const axios = require('axios');
const cheerio = require('cheerio');

async function checkBoard() {
    console.log('Checking Eloboard Input Team category...');
    try {
        const { data } = await axios.get('https://eloboard.com/univ/bbs/board.php?bo_table=input_team', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        const posts = [];
        
        $('a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            if (href.includes('bo_table=input_team') && href.includes('wr_id=') && title.length > 2) {
                if (!posts.find(p => p.title === title)) {
                    posts.push({ title, href });
                }
            }
        });
        
        console.log(`Found ${posts.length} posts.`);
        posts.slice(0, 20).forEach(p => console.log(`- ${p.title}`));
        
        const joMatches = posts.filter(p => p.title.includes('조일장'));
        console.log(`\nJo Il-jang mentions in titles: ${joMatches.length}`);
        joMatches.forEach(p => console.log(`- ${p.title}`));
        
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkBoard();
