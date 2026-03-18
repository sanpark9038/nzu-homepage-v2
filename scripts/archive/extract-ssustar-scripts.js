const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('.tmp/ssustar_uni_battle.html', 'utf8');
const $ = cheerio.load(html);

let allScripts = '';
$('script').each((i, el) => {
    const src = $(el).attr('src');
    if (!src) {
        allScripts += `\n/* --- Script ${i} --- */\n` + $(el).html() + '\n';
    }
});

fs.writeFileSync('.tmp/ssustar_scripts.js', allScripts);
console.log('Scripts extracted directly.');
