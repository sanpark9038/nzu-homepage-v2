const fs = require('fs');
const html = fs.readFileSync('.tmp/ssustar_scripts.js', 'utf8');

// The NZU players might be under a different college name
// Search for 늪 or 뉴캣슬 
const searchTerms = ['NZU', '뉴캣슬', '늪'];

searchTerms.forEach(term => {
    const idx = html.indexOf(term);
    if (idx > -1) {
        console.log(`Found '${term}' at index ${idx}:`);
        console.log(html.substring(Math.max(0, idx-30), idx+200));
        console.log('---');
    } else {
        console.log(`'${term}' NOT FOUND`);
    }
});

// Also check the college roster object keys
const collegeRostersMatch = html.match(/const collegeRosters = (\{.{0,5000}\});/s);
if (collegeRostersMatch) {
    try {
        const cr = JSON.parse(collegeRostersMatch[1]);
        console.log('\nCollege names found:', Object.keys(cr));
    } catch(e) {
        // Korean JSON might need special handling  
        const keys = html.match(/"([^"]+)":\["/g);
        if (keys) {
            console.log('\nCollege entries:', keys.slice(0,30).map(k => k.replace(/":/,"").replace(/"/g,'')));
        }
    }
}
