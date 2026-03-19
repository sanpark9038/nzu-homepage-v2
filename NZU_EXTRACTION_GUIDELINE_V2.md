# 🛡️ NZU 데이터 추출 엄격 지침서 (V2.1)
> **목적**: 엘로보드(Eloboard) 전적 데이터 수집 시 '혼성 전적' 유입을 100% 차단하고 데이터 순수성을 유지하기 위한 실행 지침.

## 1. 🚨 데이터 추출 대원칙
1. **섹션 우선순위**: 검색/파싱은 반드시 `[여성밀리전적]` 섹션 내부에서만 수행한다.
2. **이름/메모 검증**: 상대 플레이어 이름이나 메모 필드에 '혼성', '남성', '쌍디', '병하' 등 관련 키워드가 한 글자라도 포함되면 즉시 폐기한다.
3. **불명확한 데이터 배제**: 승패 판독이 모호하거나 배경색이 표준(#0CF, #434348)이 아닌 경우, ELO 포인트 변동이 없는 경우는 통계에서 제외한다.

## 2. 🛠️ 기술적 파싱 알고리즘 (Algorithm)
데이터 수집 스크립트 작성 시 아래 로직을 반드시 준수해야 함.

### 2.1 섹션 격리 (Section Isolation)
*   **시작 지점**: HTML 내에서 `[여성밀리전적]` 텍스트가 포함된 `<b>` 또는 `<strong>` 태그 이후부터 파싱 시작.
*   **종료 지점**: `[혼성밀리전적]` 또는 `[기타전적]` 텍스트가 등장하는 즉시 파싱을 중단(break).
*   *이유*: 엘로보드 테이블 구조상 여러 전적이 하나의 큰 부모 요소에 묶여 있어, 단순 테이블 스캔 시 데이터가 섞이는 현상이 발생함.

### 2.2 이중 필터링 (Double Filtering)
1.  **날짜 필터**: `2025-01-01` 이전 전적은 루프 내에서 즉시 처리 제외.
2.  **키워드 블랙리스트**: 아래 키워드가 포함된 행(Row)은 수집하지 않음.
    *   `혼성`, `남성`, `남비`, `쌍디`, `병하`, `대결`, `CK(혼성)`

## 3. 🔍 데이터 무결성 검증 (QA)
수집된 데이터는 최종 통계 산출 전 반드시 다음을 체크한다.
*   **Total Count Cross-Check**: "총 전적 = 승 + 패" 가 성립하는가?
*   **Mixed Data Leakage**: 수집된 데이터 중 `memo` 혹은 `opponent` 컬럼에 블랙리스트 키워드가 남아있는가?
*   **Date Range Check**: 수집된 데이터 중 2024년 이전 날짜가 존재하는가?

## 4. 📝 향후 작업 지침
*   새로운 선수를 추가할 때마다 `check_mixed_contamination.js` (가칭)를 가동하여 섹션 침범 여부를 선제적으로 확인한다.
*   **산박대표님**께 보고 시, 제외된 건수(Exclusion Count)를 명시하여 로직의 투명성을 확보한다.

---
**엘레이드박 CTO 서명** ✍️ 🫡✨

---

## 5. 🔐 인코딩 표준 (메인 AI + Codex CLI 오케스트레이션 환경)
> 보조 AI(Codex CLI) 검증 완료 기준 — 3개 핵심 보완 사항

### 5.1 `node -e` 인라인 실행 금지 (실무 룰)
- 한글이 포함된 코드는 **절대 `node -e "..."` 인라인으로 실행하지 않는다**.
- 반드시 `.js` 파일을 생성한 후 `node 파일명.js`로 실행한다.
- 이유: Windows 셸이 다국어 문자를 파이프 과정에서 CP949로 변환함.

### 5.2 `.gitattributes` 인코딩 강제
- 줄바꿈(EOL) 제어에 더해, **`working-tree-encoding=UTF-8`** 명시 필수.
- 적용 완료: [`.gitattributes`]
  ```
  *.js   text eol=lf working-tree-encoding=UTF-8
  *.json text eol=lf working-tree-encoding=UTF-8
  ```

### 5.3 PowerShell UTF-8 완전 고정 (3단계)
매 세션마다 자동 적용되도록 **PowerShell 프로파일**에 등록 완료.
```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding  = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding           = [System.Text.UTF8Encoding]::new($false)
$PSDefaultParameterValues['*:Encoding'] = 'utf8'   # ← 파일 입출력 실수 방지
```

