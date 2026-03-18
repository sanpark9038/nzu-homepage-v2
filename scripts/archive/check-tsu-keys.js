const axios = require('axios');
async function check() {
  const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
  const pRegex = /"트슈_(.*?)_0"/g;
  let match;
  while ((match = pRegex.exec(res.data)) !== null) {
      console.log(match[0]);
  }
}
check();
