const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');
const { createClient } = require('@supabase/supabase-js');
let dotenv;
try {
    dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
} catch (e) {
    // Falls back to existing env if dot-env is not available
}

/**
 * 🏟️ Phased University Sync (Premium PINPOINT Engine)
 * 로직:
 * 1. 대학별 인원 추출
 * 2. wr_id 기반 프로필 페이지(board.php) 직접 파싱 (가장 정확)
 * 3. 2025년 1월 1일 이후 데이터만 타겟팅
 * 4. #00CCFF(#0CF) 배경색 기반 승패 판독
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const DELAY = 1000;
const START_DATE = '2025-01-01';

async function fetchMatchHistoryPinpoint(name, wrId, gender) {
    const subdomain = gender === 'male' ? 'men' : 'women';
    const matches = [];
    // wr_id가 없으면 수집 불가
    if (!wrId) {
        console.log(`  ⚠️ [${name}] eloboard_id가 없습니다.`);
        return [];
    }

    const url = `https://eloboard.com/${subdomain}/bbs/board.php?bo_table=bj_list&wr_id=${wrId}`;
    
    try {
        const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
        const $ = cheerio.load(html);
        
        $('tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 6) {
                const dateRaw = $(cells[0]).text().trim();
                
                // 날짜 형식 체크 및 2025년 필터링
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
                    if (dateRaw < START_DATE) return;

                    const oppRaw = $(cells[1]).text().trim();
                    const map = $(cells[2]).text().trim();
                    const note = $(cells[5]).text().trim();

                    // --- 정밀 승패 판독 (#00CCFF) ---
                    const styleAttr = $(cells[0]).attr('style') || '';
                    const styleClean = styleAttr.replace(/\s/g, '').toLowerCase();
                    
                    let isWin = false;
                    if (styleClean.includes('background:#0cf') || styleClean.includes('background:#00ccff')) {
                        isWin = true;
                    } else if (styleClean.includes('background:#434348')) {
                        isWin = false;
                    } else {
                        const scoreText = $(cells[3]).text().trim();
                        isWin = scoreText.includes('승') || scoreText.includes('+');
                    }

                    const oppMatch = oppRaw.match(/^(.*?)\((.*?)\)$/);
                    const opponentName = oppMatch ? oppMatch[1] : oppRaw;
                    const opponentRace = (oppMatch ? oppMatch[2] : 'U').charAt(0).toUpperCase();

                    matches.push({
                        player_name: name,
                        opponent_name: opponentName,
                        opponent_race: ['P','T','Z'].includes(opponentRace) ? opponentRace : 'U',
                        map,
                        is_win: isWin,
                        result_text: $(cells[3]).text().trim(),
                        match_date: dateRaw,
                        note: note,
                        gender: gender
                    });
                }
            }
        });
        
        return matches;
    } catch (e) {
        console.error(`  💥 [${name}] Fetch Failed: ${e.message}`);
        return null;
    }
}

async function runPhasedSync() {
    const university = process.argv[2];
    if (!university) {
        process.exit(1);
    }

    console.log(`\n🚀 [${university}] 릴레이 수집 진군 개시! (Pinpoint Mode)`);
    
    const { data: players, error: pError } = await supabase
        .from('players')
        .select('*')
        .eq('university', university);

    if (pError || !players) return;

    let totalMatches = 0;

    for (const player of players) {
        process.stdout.write(`🔍 [${player.name}] 분석 중... `);
        
        // 나예리 핀포인트 보정
        let targetId = player.eloboard_id;
        if (player.name === '나예리' && player.race === 'T') targetId = '177';

        const matches = await fetchMatchHistoryPinpoint(player.name, targetId, player.gender);
        
        if (matches && matches.length > 0) {
            // 해당 선수의 2025년 이후 데이터 초기화 후 삽입
            await supabase.from('eloboard_matches')
                .delete()
                .eq('player_name', player.name)
                .gte('match_date', START_DATE);

            const { error: insError } = await supabase.from('eloboard_matches').insert(matches);
            
            if (insError) console.error(`❌ DB Insert 실패: ${insError.message}`);
            else {
                console.log(`✅ ${matches.length}건 저장 완료.`);
                totalMatches += matches.length;
            }
        } else if (matches === null) {
            console.log(`❌ 수동 확인 필요.`);
        } else {
            console.log(`💤 2025년 전적 없음.`);
        }

        await new Promise(r => setTimeout(r, DELAY));
    }

    console.log(`\n🏁 [${university}] 진군 완료! (총 수집: ${totalMatches}건)`);
    console.log(`------------------------------------\n`);
}

runPhasedSync();
