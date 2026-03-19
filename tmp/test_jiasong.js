const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

const filePath = path.join(__dirname, 'jiasong_debug.txt');
const html = fs.readFileSync(filePath, 'utf8');
const $ = cheerio.load(html);

const matches = [];
$('tr').each((i, el) => {
    const style = $(el).attr('style') || '';
    if (style.includes('border-bottom:1px solid #CCC')) {
        const cols = $(el).find('td');
        if (cols.length >= 6) {
            const date = $(cols[0]).text().trim();
            const opponent = $(cols[1]).text().trim();
            const map = $(cols[2]).text().trim();
            const mode = $(cols[4]).text().trim();
            const memo = $(cols[5]).text().trim();
            
            // Filter: 2025-01-01 onwards
            if (date < '2025-01-01') return;

            // Filter: Exclude mixed matches (혼성)
            if (memo.includes('혼성')) return;

            // bg color style: #0CF (Blue) is WIN, #434348 (Dark) is LOSE
            const bgStyle = $(cols[0]).attr('style') || '';
            const isWin = bgStyle.includes('#0CF');
            
            matches.push({
                날짜: date,
                상대: opponent,
                맵: map,
                결과: isWin ? '🏆 WIN' : '💀 LOSE',
                비고: memo.slice(0, 30) + (memo.length > 30 ? '...' : '')
            });
        }
    }
});

console.log('\n--- [지아송] 최근 전적 데이터 (테스트) ---');
console.table(matches.slice(0, 15));
console.log(`\n📊 총 ${matches.length}개의 전적을 확인했습니다.`);
if (matches.length > 0) {
    console.log(`📅 가장 오래된 전적 날짜: ${matches[matches.length-1].날짜}`);
    const mixedCount = matches.filter(m => m.비고.includes('혼성')).length;
    console.log(`🔍 결과 내 '혼성' 포함 건수: ${mixedCount}`);
}
