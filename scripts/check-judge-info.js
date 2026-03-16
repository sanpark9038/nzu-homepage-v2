const axios = require('axios');
async function check() {
  const res = await axios.get('https://ssustar.iwinv.net/university_battle.php');
  const infoMatch = res.data.match(/const playerInfo = (\{.*?\});/s);
  if (infoMatch) {
      const info = JSON.parse(infoMatch[1]);
      for (const name in info) {
          if (name.includes('Judge')) {
              console.log('Found:', name, JSON.stringify(info[name], null, 2));
          }
      }
  }
}
check();
