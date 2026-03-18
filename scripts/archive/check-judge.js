const axios = require('axios');
async function check() {
  const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
  const pRegex = /"([^"]+?_[PTZR]_0)"/g;
  let match;
  while ((match = pRegex.exec(res.data)) !== null) {
      if (match[1].toLowerCase().includes('judge') || match[1].includes('현')) {
          console.log('Key:', match[1]);
      }
  }
}
check();
