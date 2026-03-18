const axios = require('axios');
const cheerio = require('cheerio');

/**
 * [실험 1단계] 늪지대 소속 및 종족 정밀 추출 (환각 제거 버전)
 * 규칙:
 * 1. td 내 p.table_text 태그의 텍스트를 "있는 그대로" 추출
 * 2. 추측성 데이터(P, T, Z)로 변환하지 않고 Raw 텍스트를 우선 보여줌
 */

const TARGET_UNIV = '늪지대';
const URL = `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=${encodeURIComponent(TARGET_UNIV)}`;

async function fetchRosterRaw() {
    console.log(`🧪 [Exp 1-Final] Fetching Raw Roster for: ${TARGET_UNIV}...`);

    try {
        const response = await axios.get(URL, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const html = response.data.toString('utf8');
        const $ = cheerio.load(html);
        
        const roster = [];
        
        $('table tbody tr').each((i, row) => {
            const cells = $(row).find('td');
            const nameLink = $(row).find('a.p_name');
            
            if (nameLink.length > 0) {
                // 1. 이름 및 티어 (첫 번째 td)
                const fullName = nameLink.text().trim(); // 예: "쌍디(6)"
                
                // 2. 종족 정보 (두 번째 td의 p.table_text 텍스트)
                // 사용자님 지시대로 Zerg 등 텍스트가 직접 들어있음
                const raceCellText = $(cells[1]).find('.table_text').text().trim();
                const firstLineRace = raceCellText.split('\n')[0].trim(); // 첫 줄만 추출

                roster.push({ 
                    '선수명(티어)': fullName,
                    '추출된_값(종족)': firstLineRace,
                    '소속 대학': TARGET_UNIV 
                });
            }
        });

        console.log(`\n✅ 늪지대 실시간 파싱 결과 (총 ${roster.length}명):\n`);
        console.table(roster);

    } catch (err) {
        console.error('💥 Error:', err.message);
    }
}

fetchRosterRaw();
