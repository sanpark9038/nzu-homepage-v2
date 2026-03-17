const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
};

/**
 * [으냉이] 선수의 데이터를 샘플로 하여 
 * 대표님이 주신 이미지 1의 '진실'과 대조하는 최종 검증 스크립트
 */
async function finalVerification() {
    const name = '으냉이';
    const subdomain = 'women';
    
    console.log(`\n--- [${name}] 최종 정밀 검증 보고서 (대표님 이미지 1 대조용) ---`);
    console.log(`※ 판정 근거: 개발자 도구(DOM) 분석을 통한 인라인 스타일 '#0CF' 및 '#434348' 직접 추출\n`);
    
    try {
        const { data: html } = await axios.post(`https://eloboard.com/${subdomain}/bbs/view_list.php`, qs.stringify({
            p_name: name,
            last_id: 0,
            b_id: 'eloboard'
        }), { headers: HEADERS, timeout: 15000 });
        
        const $ = cheerio.load(html);
        const rows = [];

        $('tr').each((i, el) => {
            if (i === 0) return; // Header skip
            if (rows.length >= 15) return; // 상위 15건 샘플

            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const dateRaw = $(cells[0]).text().trim();
                const oppRaw = $(cells[1]).text().trim();
                const map = $(cells[2]).text().trim();
                const note = $(cells[5]).text().trim();

                // --- [핵심] 개발자 도구 기반 정밀 판정 로직 ---
                // 첫 번째 td(날짜 칸)의 style 속성을 가져옴
                const styleAttr = $(cells[0]).attr('style') || '';
                
                // 1. 공백 제거 및 소문자 변환하여 비교 (정확도 극대화)
                const styleClean = styleAttr.replace(/\s/g, '').toLowerCase();
                
                let isWin = false;
                // 대표님이 주신 #00CCFF는 인라인 스타일에서 보통 #0cf로 축약되어 저장됨
                if (styleClean.includes('background:#0cf') || styleClean.includes('background:#00ccff')) {
                    isWin = true;
                } else if (styleClean.includes('background:#434348')) {
                    isWin = false;
                } else {
                    // 배경색이 없는 경우 예외 처리 (기존 부호 방식 백업)
                    const eloRaw = $(cells[3]).text().trim();
                    isWin = eloRaw.includes('+') || (!eloRaw.includes('-') && parseFloat(eloRaw) > 0);
                }

                const resultText = isWin ? '승' : '패';

                // 상대명 및 종족 분리
                const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                const opponentRace = (oppMatch ? oppMatch[2] : 'U').charAt(0).toUpperCase();

                rows.push({
                    날짜: dateRaw,
                    상대명: opponentName,
                    종족: opponentRace,
                    맵: map,
                    결과: resultText,
                    비고: note
                });
            }
        });

        console.table(rows);
        console.log(`\n✅ [판독 완료] 이미지 1의 12월 30일 엄보리전(승리) 등이 정확히 매칭되는지 확인해 주십시오.`);

    } catch (e) {
        console.error(`💥 Failed: ${e.message}`);
    }
}

finalVerification();
