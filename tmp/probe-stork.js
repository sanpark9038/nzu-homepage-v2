const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');

async function probeStorkData() {
    const url = 'https://eloboard.com/men/bbs/view_list.php';
    const params = {
        bo_table: 'bj_list',
        wr_id: '16',
        p_name: '송병구(P)',
        wr_8: '', // 전체 연도
        last_id: '' // 처음부터
    };

    console.log(`📡 [송병구] 총사령관 데이터 뒷문(AJAX) 타격 개시...`);

    try {
        const response = await axios.post(url, qs.stringify(params), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 30000
        });

        const $ = cheerio.load(response.data);
        const rows = $('tr');
        console.log(`✅ 응답 수신 완료! 추출된 행 수: ${rows.length}개`);

        let matches2025 = [];
        rows.each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length < 5) return;

            const date = $(tds[0]).text().trim();
            if (date.startsWith('2025') || date.startsWith('2026')) {
                const opponent = $(tds[1]).text().trim();
                const result = $(tds[0]).attr('bgcolor') === '#0CF' ? '승' : '패';
                const map = $(tds[2]).text().trim();
                matches2025.push({ date, opponent, result, map });
            }
        });

        if (matches2025.length > 0) {
            console.log(`🏆 [검증 성공] 대표님! 송병구 선수 2025년 이후 데이터 ${matches2025.length}건을 즉시 확보했습니다!`);
            console.log(`최근 경기 예시: ${matches2025[0].date} vs ${matches2025[0].opponent} (${matches2025[0].result})`);
            console.log(`가장 오래된 2025 경기: ${matches2025[matches2025.length - 1].date}`);
        } else {
            console.log(`🤔 2025년 데이터가 첫 페이지에 없습니다. 페이지네이션(last_id) 추적이 필요해 보입니다.`);
        }

    } catch (e) {
        console.error(`🚨 타격 실패: ${e.message}`);
    }
}

probeStorkData();
