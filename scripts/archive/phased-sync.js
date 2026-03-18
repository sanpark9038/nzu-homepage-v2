const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
let dotenv;
try {
    dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
} catch (e) {
    // Falls back to existing env
}

/**
 * 🏟️ Phased University Sync (Premium COMPLETE Engine V4)
 * 로직:
 * 1. 대학별 인원 추출
 * 2. view_list.php AJAX 요청 (p_name, last_id) 반복 호출로 2025년 전적 전량 확보
 * 3. 점수(ELO) 데이터 제외 (is_win/result_text 승패만 보관)
 * 4. #00CCFF(0CF, 승) / #434348(패) 정밀 판독
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': 'https://eloboard.com',
    'Referer': 'https://eloboard.com'
};

const DELAY = 1500; // 서버 부하 방지를 위해 조금 넉넉히 (산박대표님 지시)
const START_DATE = '2025-01-01';

async function fetchAllCompleteMatches(name, gender) {
    const subdomain = gender === 'male' ? 'men' : 'women';
    const allMatches = [];
    
    let lastId = 1; // 1부터 시작하는 페이지 번호 개념 (더보기 버튼 id)
    let hasMore = true;
    let pageCount = 1;

    console.log(`\n🔍 [${name}] (${gender}) 전수 조사 진군...`);

    while (hasMore) {
        try {
            const url = `https://eloboard.com/${subdomain}/bbs/view_list.php`;
            
            // POST 데이터: p_name=이름&last_id=페이지&b_id=eloboard
            const postData = qs.stringify({
                p_name: name,
                last_id: lastId,
                b_id: 'eloboard'
            });

            const { data: html } = await axios.post(url, postData, { 
                headers: { ...HEADERS, 'Referer': `https://eloboard.com/${subdomain}/bbs/board.php?bo_table=bj_list` },
                timeout: 15000 
            });

            if (!html || html.trim().length < 50) {
                hasMore = false;
                break;
            }

            const $ = cheerio.load(html);
            const rows = $('tr');
            
            if (rows.length === 0) {
                hasMore = false;
                break;
            }

            let foundOlderThan2025 = false;
            let currentBatchCount = 0;

            rows.each((i, el) => {
                const cells = $(el).find('td');
                if (cells.length >= 6) {
                    const dateRaw = $(cells[0]).text().trim();
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return;

                    // 2025년 이전 데이터가 나오면 중단 예고
                    if (dateRaw < START_DATE) {
                        foundOlderThan2025 = true;
                        return;
                    }

                    const oppRaw = $(cells[1]).text().trim();
                    const map = $(cells[2]).text().trim();
                    const note = $(cells[5]).text().trim();

                    // --- 정밀 승패 판독 (#00CCFF vs #434348) ---
                    const styleAttr = $(cells[0]).attr('style') || '';
                    const styleClean = styleAttr.replace(/\s/g, '').toLowerCase();
                    
                    let isWin = false;
                    // 대문자 소문자 shorthand 모두 대응 (#0cf, #00ccff 등)
                    if (styleClean.includes('background:#0cf') || styleClean.includes('background:#00ccff')) {
                        isWin = true;
                    } else if (styleClean.includes('background:#434348')) {
                        isWin = false;
                    } else {
                        // 투명하거나 예외적인 경우 부호 확인
                        const scoreText = $(cells[3]).text().trim();
                        isWin = scoreText.includes('+') || scoreText.includes('승');
                    }

                    const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                    const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                    const opponentRace = (oppMatch ? oppMatch[2] : 'U').charAt(0).toUpperCase();

                    allMatches.push({
                        player_name: name,
                        opponent_name: opponentName,
                        opponent_race: ['P','T','Z'].includes(opponentRace) ? opponentRace : 'U',
                        map,
                        is_win: isWin,
                        result_text: isWin ? '승' : '패', // 점수 대신 승/패 텍스트 보관
                        match_date: dateRaw,
                        note: note,
                        gender: gender
                    });
                    currentBatchCount++;
                }
            });

            // "더 보기" 버튼 추출 (다음 last_id 확인)
            const moreButton = $('button.btn_more');
            if (moreButton.length > 0 && !foundOlderThan2025) {
                lastId = parseInt(moreButton.attr('id')) || (lastId + 1);
            } else {
                hasMore = false;
            }

            if (foundOlderThan2025) hasMore = false;

            process.stdout.write(`  📄 Page ${pageCount} 완료 (${currentBatchCount}건)... `);
            pageCount++;

            // 과도한 루프 방지
            if (pageCount > 50) {
                console.log("\n  ⚠️ 최대 페이지 도달.");
                hasMore = false;
            }

            await new Promise(r => setTimeout(r, 500)); // 연쇄 요청 간격

        } catch (e) {
            console.error(`\n  💥 통신 장애: ${e.message}`);
            hasMore = false;
        }
    }

    return allMatches;
}

async function runSsuStarSync() {
    const university = '수술대';
    console.log(`\n🦁 [${university}] 2025년 전적 무결성 재건 작전 개시!`);
    
    const { data: players, error: pError } = await supabase
        .from('players')
        .select('*')
        .eq('university', university);

    if (pError || !players) {
        console.error("❌ 선수 로딩 실패");
        return;
    }

    let grandTotal = 0;

    for (const player of players) {
        const matches = await fetchAllCompleteMatches(player.name, player.gender);
        
        if (matches.length > 0) {
            // 2025년 데이터 덮어쓰기 (기존 찌꺼기 제거)
            await supabase.from('eloboard_matches')
                .delete()
                .eq('player_name', player.name)
                .gte('match_date', START_DATE);

            const { error: insError } = await supabase.from('eloboard_matches').insert(matches);
            
            if (insError) {
                console.error(`\n  ❌ DB 저장 실패: ${insError.message}`);
            } else {
                console.log(`\n  ✅ ${matches.length}건 정밀 저장 완료.`);
                grandTotal += matches.length;
            }
        } else {
            console.log(`\n  💤 2025년 기록이 없습니다.`);
        }

        await new Promise(r => setTimeout(r, DELAY));
    }

    console.log(`\n🏁 [${university}] 작전 완료! (총 ${grandTotal}건 확보)`);
    console.log(`------------------------------------\n`);
}

runSsuStarSync();
