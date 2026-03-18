const axios = require('axios');
async function check() {
    const vsRes = await axios.get('https://ssustar.iwinv.net/1vs1.php');
    const pRegex = /\{"key":"(.*?)"\}/g;
    let match;
    const invalid = new Set();
    while ((match = pRegex.exec(vsRes.data)) !== null) {
        const parts = match[1].split('_');
        if (parts.length >= 2) {
            const race = parts[1].toUpperCase();
            if (!['P', 'T', 'Z', 'R'].includes(race)) invalid.add(`${parts[0]}: ${race}`);
        }
    }
    console.log('Players with potentially invalid races:', Array.from(invalid));
}
check();
