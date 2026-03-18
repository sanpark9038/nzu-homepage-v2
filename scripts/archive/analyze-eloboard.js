const fs = require('fs');

const html = fs.readFileSync('.tmp/eloboard_aegong.html', 'utf8');

// Find all $.ajax blocks with full context
let idx = 0;
let blockNum = 0;
while (true) {
    const foundIdx = html.indexOf('$.ajax', idx);
    if (foundIdx === -1) break;
    blockNum++;
    // Get 1000 chars of context
    const block = html.substring(foundIdx, foundIdx + 1000);
    console.log(`\n=== Ajax Block ${blockNum} ===`);
    // Clean up whitespace for readability
    console.log(block.replace(/\s+/g, ' ').substring(0, 800));
    idx = foundIdx + 10;
}

// Also search for p_nistics or similar params
const pNist = html.indexOf('p_nistics');
if (pNist > -1) {
    console.log('\n=== p_nistics context ===');
    console.log(html.substring(Math.max(0, pNist-200), pNist+400).replace(/\s+/g, ' '));
}

// And the actual player name var
const pName = html.indexOf('애공');
if (pName > -1) {
    // Find surrounding 500 chars
    console.log('\n=== 애공 context in HTML ===');
    const ctx = html.substring(Math.max(0, pName-100), pName+400);
    console.log(ctx.replace(/\s+/g, ' ').substring(0, 500));
}
