const axios = require('axios');
const cheerio = require('cheerio');
const { supabase } = require('../utils/db');

/**
 * NZU Match Sync Core (Clean Start Edition)
 * 최적화:
 * 1. 한 경기를 P1, P2 양쪽 관점에서 넣을 때 발생하는 중복 삽입 에러(ON CONFLICT) 방지
 * 2. UNIQUE 인덱스 충돌 방지를 위해 메모리 내에서 1차 중복 제거 후 삽입
 */

const BASE_URL = 'https://eloboard.com/univ/bbs/board.php?bo_table=input_team';
const DELAY_MS = 1000;
const MAX_PAGES = 15;

const INCLUDE_KEYWORDS = ['리그', '컵', '대회', '스타대전', '8강', '4강', '준결승', '결승', 'B조', 'A조', '드래프트', '프리시즌', '대학전', '정선숲퍼컵', '수술대'];
const EXCLUDE_KEYWORDS = ['미니대전', '교수대전', '교류전', '유스', '아카데미', '친선'];

async function fetchHtml(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data.toString('utf8');
}

async function scrapeMatches() {
    const startTime = Date.now();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    console.log(`🚀 NZU Clean Match Sync Starting...`);
    let totalMatchesStored = 0;

    try {
        for (let page = 1; page <= MAX_PAGES; page++) {
            console.log(`\n📄 Page ${page}/${MAX_PAGES} Scanning...`);
            const listHtml = await fetchHtml(`${BASE_URL}&page=${page}`);
            const $list = cheerio.load(listHtml);
            const posts = [];

            $list('a').each((_, el) => {
                const href = $list(el).attr('href') || '';
                const title = $list(el).text().trim();
                if (href.includes('bo_table=input_team') && href.includes('wr_id=') && title.length > 5) {
                    if (!posts.find(p => p.href === href)) {
                        posts.push({ title, href });
                    }
                }
            });

            for (const post of posts) {
                const isOfficial = INCLUDE_KEYWORDS.some(k => post.title.includes(k));
                const isExcluded = EXCLUDE_KEYWORDS.some(k => post.title.includes(k));

                if (!isOfficial && isExcluded) continue;

                console.log(`  🔍 crawling: [${post.title}]`);
                await new Promise(r => setTimeout(r, DELAY_MS));

                try {
                    const postHtml = await fetchHtml(post.href);
                    const $post = cheerio.load(postHtml);
                    const rawMatches = [];
                    const seenInPost = new Set(); // 포스트 내 중복 방지

                    const dateMatch = post.title.match(/(\d{1,2})\.(\d{1,2})/);
                    let matchDate = '';
                    if (dateMatch) {
                        const mMonth = parseInt(dateMatch[1]);
                        let year = currentYear;
                        if (mMonth > currentMonth + 3) year = currentYear - 1;
                        matchDate = `${year}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
                    } else {
                        matchDate = new Date().toISOString().split('T')[0];
                    }

                    $post('table').each((_, table) => {
                        const trs = $post(table).find('tr');
                        trs.each((__, tr) => {
                            const text = $post(tr).text().trim().replace(/\s+/g, ' ');
                            if (text.includes('vs') && (text.includes('win') || text.includes('lose'))) {
                                const parts = text.split(' ').filter(p => p.length > 0);
                                const winVal = parts.find(p => p.toLowerCase().includes('win') || p.toLowerCase().includes('lose'));
                                if (!winVal) return;
                                
                                const winIndex = parts.indexOf(winVal);
                                const vsIndex = parts.indexOf('vs');
                                if (winIndex === -1 || vsIndex === -1) return;

                                const matchTurn = parts[0]; 
                                const isWin = winVal.toLowerCase().includes('win');
                                const p1Name = parts[winIndex + 1];
                                const p1Race = (parts[winIndex + 2] || 'U').charAt(0).toUpperCase();
                                const p2Name = parts[vsIndex + 1];
                                const p2Race = (parts[vsIndex + 2] || 'U').charAt(0).toUpperCase();
                                const gameMap = parts[parts.length - 1];

                                if (!p1Name || !p2Name) return;

                                const note = `${post.title.slice(0, 50)} (${matchTurn})`;

                                // 한 경기에 대해 P1, P2 두 번 데이터를 생성하지만,
                                // DB 트랜잭션 내에서 한 행이 두 번 업데이트되려 할 때 에러가 나므로
                                // 메모리 상에서 이미 처리된 "쌍"이라면 건너뛰거나 순차 처리
                                
                                const m1 = {
                                    player_name: p1Name, opponent_name: p2Name, opponent_race: p2Race,
                                    map: gameMap, is_win: isWin, result_text: isWin ? 'win' : 'lose',
                                    match_date: matchDate, note: note
                                };
                                const k1 = `${m1.player_name}|${m1.opponent_name}|${m1.match_date}|${m1.map}|${m1.result_text}|${m1.note}`;
                                if (!seenInPost.has(k1)) {
                                    rawMatches.push(m1);
                                    seenInPost.add(k1);
                                }

                                const m2 = {
                                    player_name: p2Name, opponent_name: p1Name, opponent_race: p1Race,
                                    map: gameMap, is_win: !isWin, result_text: !isWin ? 'win' : 'lose',
                                    match_date: matchDate, note: note
                                };
                                const k2 = `${m2.player_name}|${m2.opponent_name}|${m2.match_date}|${m2.map}|${m2.result_text}|${m2.note}`;
                                if (!seenInPost.has(k2)) {
                                    rawMatches.push(m2);
                                    seenInPost.add(k2);
                                }
                            }
                        });
                    });

                    if (rawMatches.length > 0) {
                        // 한 포스트의 경기를 순차적으로 처리하여 DB 에러 방지
                        const { error: upsertError } = await supabase.from('eloboard_matches').upsert(rawMatches, {
                            onConflict: 'player_name, opponent_name, match_date, map, result_text, note'
                        });
                        
                        if (!upsertError) {
                            totalMatchesStored += rawMatches.length / 2;
                        } else {
                            // 벌크 업서트 실패 시 하나씩 시도 (더 안전함)
                            for (const m of rawMatches) {
                                await supabase.from('eloboard_matches').upsert(m, { onConflict: 'player_name, opponent_name, match_date, map, result_text, note' });
                            }
                            totalMatchesStored += rawMatches.length / 2;
                        }
                    }

                } catch (e) {
                    console.error(`    ❌ Failed post: ${post.title}`, e.message);
                }
            }
        }

        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✨ Clean Sync Summary: ~${Math.floor(totalMatchesStored)} games processed. Duration: ${duration}s`);

    } catch (err) {
        console.error('💥 FATAL:', err.message);
    }
}

scrapeMatches();
