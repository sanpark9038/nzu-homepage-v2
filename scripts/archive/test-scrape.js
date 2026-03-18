const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeAllBJ(page) {
    const url = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&page=${page}`;
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    const results = [];

    $('tr').each((i, row) => {
        const nameAnchor = $(row).find('a.p_name');
        const href = nameAnchor.attr('href') || '';
        const wrIdMatch = href.match(/wr_id=(\d+)/);
        if (!wrIdMatch) return;

        const wr_id = wrIdMatch[1];
        const name = nameAnchor.text().trim();

        let university = '무소속';
        // Look for any link that points to a university profile
        $(row).find('a').each((j, a) => {
            const h = $(a).attr('href') || '';
            if (h.includes('bo_table=univ_list') || h.includes('bo_table=month_list')) {
                const uMatch = h.match(/wr_id=(\d+)/);
                if (uMatch) {
                    const uName = $(a).text().trim() || $(a).attr('title')?.trim();
                    if (uName && uName !== '전적피드' && uName !== '로그인') {
                        university = uName;
                    }
                }
            }
        });
        
        // Fallback: search for specific university name strings in the cell text
        if (university === '무소속') {
            const text = $(row).text();
            const commonUnivs = ['뉴캣슬', 'NSU', 'CP', '무친대', '유치원', 'JSA', '우끼끼즈', '보성대', '철구대', '염석대'];
            for (const cu of commonUnivs) {
                if (text.includes(cu)) {
                    university = cu;
                    break;
                }
            }
        }

        results.push({ wr_id, name, university });
    });
    return results;
}

async function test() {
    const res = await scrapeAllBJ(3); // Guramis is on page 3
    console.log(res.find(r => r.name.includes('김성민') || r.wr_id === '149'));
}

test();
