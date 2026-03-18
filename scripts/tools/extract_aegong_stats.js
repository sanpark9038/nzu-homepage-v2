const fs = require('fs');
const path = require('path');

function parseStats() {
    const filePath = 'aegong_stats_utf8.html';
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    const html = fs.readFileSync(filePath, 'utf8');
    
    // 여성밀리전적 테이블 영역 추출
    // [여성밀리전적] 헤더 이후부터 [혼성밀리전적] 헤더 이전까지를 자릅니다.
    const femaleStart = html.indexOf('<strong>[여성밀리전적');
    const mixedStart = html.indexOf('<strong>[혼성밀리전적');
    
    if (femaleStart === -1) {
        console.log("Could not find female match section");
        return;
    }

    const femaleSection = mixedStart !== -1 
        ? html.substring(femaleStart, mixedStart) 
        : html.substring(femaleStart);

    // <tr>...</tr> 패턴 매칭
    const trRegex = /<tr style="border-bottom:1px solid #CCC; ">([\s\S]*?)<\/tr>/g;
    let match;
    const results = [];

    while ((match = trRegex.exec(femaleSection)) !== null) {
        const rowHtml = match[1];
        
        // <td>...</td> 데이터 추출
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
        const tds = [];
        let tdMatch;
        while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
            tds.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
        }

        if (tds.length < 6) continue;

        const date = tds[0];
        if (date < "2025-01-01") continue;

        // 결과 (Win/Loss) 판별 - 배경색 기반 (rowHtml 원본에서 직접 추출)
        const isWin = rowHtml.includes('background:#0CF');
        
        // 상대방 이름 및 종족 정규화
        const opponentRaw = tds[1];
        let opponent = opponentRaw;
        let race = "";
        const raceMatch = opponentRaw.match(/(.+)\((T|P|Z)\)/);
        if (raceMatch) {
            opponent = raceMatch[1].trim();
            race = raceMatch[2].trim();
        }

        const map = tds[2];
        const note = tds[5] || null;

        results.push({
            dt: date,
            opp: opponent,
            race: race,
            map: map,
            res: isWin ? 1 : 0,
            note: note === "" ? null : note
        });
    }

    const outputFileName = 'aegong_stats.json';
    fs.writeFileSync(outputFileName, JSON.stringify(results, null, 2), 'utf8');
    
    console.log(`Successfully extracted ${results.length} matches to ${outputFileName}.`);
    
    const wins = results.filter(r => r.res === 1).length;
    const losses = results.filter(r => r.res === 0).length;
    console.log(`Total: ${results.length}, Wins: ${wins}, Losses: ${losses}, WinRate: ${((wins/results.length)*100).toFixed(2)}%`);
}

parseStats();
