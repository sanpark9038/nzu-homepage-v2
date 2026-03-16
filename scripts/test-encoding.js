
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

async function testEncoding() {
  const url = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team&wr_id=1614';
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  
  console.log('--- CP949 ---');
  console.log(iconv.decode(res.data, 'cp949').slice(0, 500));
  
  console.log('\n--- UTF-8 ---');
  console.log(res.data.toString('utf8').slice(0, 500));
}

testEncoding();
