const axios = require('axios');
async function check() {
  const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
  const items = res.data.match(/key":"([^"]+)/g);
  if (items) {
      items.forEach(it => {
          const val = it.replace('key":"', '');
          if (val.toLowerCase().includes('judge') || val.includes('현')) {
              console.log('Match Found:', val);
          }
      });
  }
}
check();
