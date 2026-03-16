const axios = require('axios');

async function check() {
  const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
  const pRegex = /\{"key":"(.*?)"\}/g;
  let match;
  const targets = ['미동미동', '구라미스', '액션구드론', '초난강', '기뉴다'];
  while ((match = pRegex.exec(res.data)) !== null) {
      targets.forEach(t => {
          if (match[1].startsWith(t)) console.log(match[1]);
      });
  }
}
check();
