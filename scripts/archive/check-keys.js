const axios = require('axios');

async function check() {
  const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
  const pRegex = /\{"key":"(.*?)"\}/g;
  let match;
  while ((match = pRegex.exec(res.data)) !== null) {
      if (match[1].startsWith('트슈') || match[1].includes('김재현') || match[1].includes('샤이니')) {
          console.log(match[1]);
      }
  }
}
check();
