const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { BJ_NAME_MAPPING } = require('../utils/db');
const fs = require('fs');
const path = require('path');

const METADATA_PATH = path.join(__dirname, '..', 'player_metadata.json');

// 🛡️ 유효한 이름인지 검증
function isValidName(name) {
    return name && /^[\uAC00-\uD7A3a-zA-Z0-9\(\)\s]+$/.test(name) && name.length > 0;
}

// 🔑 복합 고유키: wr_id + gender
function compositeKey(wrId, gender) {
    return `${wrId}:${gender}`;
}

// 💡 알려진 늪지대 선수 이름 & wr_id 맵
// 엘로보드 univ 페이지의 이름이 euc-kr 잔재로 깨져있으므로, 
// 알려진 선수 URL(gender + wr_id)을 기반으로 이름을 역매핑합니다.
const KNOWN_NZU_PLAYERS = {
    'female:671': { name: '쌍디', tier: '6', race: 'Zerg' },
    'male:150':   { name: '인치호', tier: '조커', race: 'Zerg' },
    'male:100':   { name: '전흥식', tier: '조커', race: 'Protoss' },
    'male:207':   { name: '김성제', tier: '스페이드', race: 'Protoss' },
    'male:208':   { name: '서기수', tier: '스페이드', race: 'Protoss' },
    'female:223': { name: '애공', tier: '1', race: 'Protoss' },
    'female:57':  { name: '슬아', tier: '4', race: 'Zerg' },
    'female:668': { name: '슈슈', tier: '5', race: 'Zerg' },
    'female:846': { name: '예실', tier: '5', race: 'Protoss' },
    'female:627': { name: '연블비', tier: '6', race: 'Zerg' },
    'female:927': { name: '다라츄', tier: '8', race: 'Zerg' },
    'female:953': { name: '아링', tier: '8', race: 'Protoss' },
    'female:424': { name: '정연이', tier: '8', race: 'Protoss' },
    'female:981': { name: '지아송', tier: '8', race: 'Protoss' },
};

async function mapNzuRoster() {
    console.log('🚀 NZU Roster ID Mapping Start...');
    
    let metadata = [];
    if (fs.existsSync(METADATA_PATH)) {
        metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    }

    const targetUrl = 'https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80';
    
    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const html = iconv.decode(response.data, 'euc-kr');
        const $ = cheerio.load(html);
        
        const nzuPlayers = [];
        
        $('table.table tbody tr').each(function() {
            const row = $(this);
            const pNameEl = row.find('a.p_name');
            if (!pNameEl.length) return;

            // 개인 전적 링크에서 wr_id와 gender 추출
            const historyLink = row.find('a[target="_blank"]').attr('href') || '';
            const wrIdMatch = historyLink.match(/wr_id=(\d+)/);
            if (!wrIdMatch) return;

            const wr_id = parseInt(wrIdMatch[1]);
            const gender = historyLink.includes('/women/') ? 'female' : 'male';
            // 알려진 선수 맵에서 이름 확인
            const known = KNOWN_NZU_PLAYERS[`${gender}:${wr_id}`];
            let name, tier, race;

            if (known) {
                name = known.name;
                tier = known.tier;
                race = known.race;
            } else {
                // 미등록 선수: 텍스트에서 이름 추출 시도
                const rawText = pNameEl.text().trim();
                const nameMatch = rawText.match(/([^\(]+)\(([^\)]+)\)/);
                if (!nameMatch) return;
                name = nameMatch[1].trim();
                tier = nameMatch[2].trim();
                if (!isValidName(name)) {
                    console.warn(`⚠️  미등록 + 깨진 이름 스킵 (wr_id:${wr_id}, gender:${gender})`);
                    return;
                }
                const cells = row.find('td');
                const raceFull = $(cells[1]).text().trim();
                race = raceFull.match(/Zerg|Protoss|Terran/i)?.[0] || 'Unknown';
            }

            const mappedName = BJ_NAME_MAPPING[name] || name;
            nzuPlayers.push({ name: mappedName, wr_id, tier, race, gender });
        });

        console.log(`📊 총 ${nzuPlayers.length}명 늪지대 선수 확인`);

        // 메타데이터 업서트: 복합키(wr_id + gender) 기준
        const newMetadata = [...metadata];
        let updatedCount = 0;

        nzuPlayers.forEach(p => {
            const idx = newMetadata.findIndex(
              m => compositeKey(m.wr_id, m.gender) === compositeKey(p.wr_id, p.gender)
            );

            if (idx > -1) {
                if (newMetadata[idx].name !== p.name) {
                    console.log(`🔄 업데이트 [${p.gender}] wr_id:${p.wr_id} '${newMetadata[idx].name}' → '${p.name}'`);
                    newMetadata[idx].name = p.name;
                    updatedCount++;
                }
            } else {
                newMetadata.push({ wr_id: p.wr_id, name: p.name, gender: p.gender });
                updatedCount++;
                console.log(`➕ 신규 추가: ${p.name} [${p.gender}] wr_id:${p.wr_id}`);
            }
        });

        if (updatedCount > 0) {
            fs.writeFileSync(METADATA_PATH, JSON.stringify(newMetadata, null, 2));
            console.log(`✅ ${updatedCount}명 player_metadata.json 업데이트 완료`);
        } else {
            console.log('✨ 모든 선수 정보가 최신 상태입니다.');
        }

        console.log('\n--- 늪지대 명단 ---');
        nzuPlayers.forEach(p => {
            const icon = p.gender === 'female' ? '👩' : '👨';
            console.log(`${icon} ${p.name.padEnd(6)} | Tier: ${p.tier.padEnd(5)} | ${p.race.padEnd(7)} | wr_id: ${p.wr_id}`);
        });

    } catch (err) {
        console.error('❌ 에러:', err.message);
    }
}

mapNzuRoster();
