/**
 * HOSAGA encoding guard
 * ---
 * 터미널(CP949) vs IDE(UTF-8) 혼용 환경에서 한글 데이터 깨짐을 방지합니다.
 * 
 * 사용법:
 *  - 모든 Node.js 스크립트 최상단에 `require('./scripts/utils/encoding-guard')` 추가
 *  - 또는 scripts 실행 시 NODE_OPTIONS=--require=./scripts/utils/encoding-guard 설정
 */

'use strict';

// 1. 터미널 출력 UTF-8 강제
if (process.stdout && process.stdout.setEncoding) {
    process.stdout.setEncoding('utf8');
}
if (process.stderr && process.stderr.setEncoding) {
    process.stderr.setEncoding('utf8');
}

// 2. 파일 기본 인코딩 가이드 (주석용 - Node는 기본 utf8이지만 명시적으로 선언)
const DEFAULT_ENCODING = 'utf8';

// 3. 환경 변수로 인코딩 명시
process.env.NODE_DEFAULT_ENCODING = DEFAULT_ENCODING;

// 4. 한글 포함 파일 읽기 헬퍼 (EUC-KR 사이트용)
const iconv = require('iconv-lite');
const axios = require('axios');

/**
 * EUC-KR 인코딩 웹페이지 안전 fetch
 * @param {string} url 
 * @returns {Promise<string>} UTF-8로 변환된 HTML
 */
async function fetchEucKr(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return iconv.decode(response.data, 'euc-kr');
}

/**
 * UTF-8 JSON 파일 안전 읽기
 * @param {string} filePath 
 * @returns {any}
 */
function readJsonSafe(filePath) {
    const fs = require('fs');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * UTF-8 JSON 파일 안전 쓰기
 * @param {string} filePath 
 * @param {any} data 
 */
function writeJsonSafe(filePath, data) {
    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 이름이 유효한 한글/영문인지 검증 (깨진 euc-kr 잔재 탐지)
 * @param {string} name 
 * @returns {boolean}
 */
function isValidKoreanName(name) {
    return name && /^[\uAC00-\uD7A3a-zA-Z0-9\(\)\s]+$/.test(name);
}

module.exports = {
    DEFAULT_ENCODING,
    fetchEucKr,
    readJsonSafe,
    writeJsonSafe,
    isValidKoreanName,
};
