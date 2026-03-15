const cheerio = require('cheerio');
const fs = require('fs');

const data = fs.readFileSync('.tmp/test_https___eloboard_com_women_bbs_board_php_bo_table_search_list.html', 'utf8');
const $ = cheerio.load(data);

console.log('--- Search Form Fields ---');
$('form').each((i, form) => {
  console.log(`Form ${i} Action:`, $(form).attr('action'));
  $(form).find('input, select').each((j, el) => {
    console.log(`- ${$(el).prop('tagName')} name="${$(el).attr('name')}" value="${$(el).attr('value')}"`);
  });
});

console.log('\n--- Table Headers ---');
$('table').first().find('th').each((i, th) => {
  console.log(`TH ${i}:`, $(th).text().trim());
});

console.log('\n--- First Row Data ---');
$('table').first().find('tr').eq(1).find('td').each((i, td) => {
  console.log(`TD ${i}:`, $(td).text().trim());
});
