# NZU 데이터 엔진 재구축 계획서 (V2.0)

## 🎯 목표
Eloboard 데이터를 기반으로 한 가장 정확하고 신뢰할 수 있는 데이터 수집 환경 구축.
전면 수집 전 단계별 **실험적 검증(Experimental Validation)**을 필수 단계로 포함.

---

## 🏗️ 수집 아키텍처 및 규칙 (Rules)

### 🚫 환각 방지 및 엄격한 데이터 추출 원칙 (Critical Rules)
1. **Zero External Knowledge**: 추출 과정에서 어떠한 배경지식(스타대학 리그 시스템, 선수 과거 전적, 티어의 의미 등)도 사용하지 않는다. 오직 소스 페이지에 명시적으로 노출된 텍스트와 데이터만을 추출한다.
2. **No Interpretation**: "스페이드 티어니까 교수다"와 같은 데이터에 대한 임의의 해석이나 추론을 절대 배제한다. 비고란 등을 채울 때 원본 소스에 없는 정보는 절대 추가하지 않는다.
3. **Strict Column Extraction**: 각 섹션에서 정의된 '추출 요소'에 정의되지 않은 정보를 임의로 추가하여 보고하지 않는다.
4. **No University ID Extraction**: 대학 소속 판별 페이지(`bo_table=univ_bj_list` 등)에서 얻는 `wr_id`와 실제 상세 전적 페이지(`bo_table=bj_list`)의 `wr_id`는 서로 다르므로, 대학 페이지에서 ID를 수집하는 것을 엄격히 금지한다.
   - **위반 사례**: 애공의 '대학 페이지 ID'는 196이지만, '전적용 ID'는 223이다. 절대 196을 수집하지 말 것.

### 1. 대학 소속 판별 (University Roster)
- **소스**: `https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=[대학명]`
- **규칙**: 해당 URL 결과 페이지에 노출된 인원만을 해당 대학 소속으로 확정.
- **추출 요소**: 선수명, 종족, 티어

### 2. 개인 상세 페이지 파싱 (Individual Detail)
- **소스**: 
    - **여자**: `https://eloboard.com/women/bbs/board.php?bo_table=bj_list&wr_id=[추출된_ID]`
    - **남자**: `https://eloboard.com/men/bbs/board.php?bo_table=bj_list&wr_id=[추출된_ID]`
- **추출 요소**: 
    - 전체 승/패/승률
    - 종족별 상세 전적 (vs P, vs T, vs Z)
    - 최근 경기 기록 (맵, 상대방, 결과)

### 3. 데이터 무결성 및 중복 방지 (Integrity)
- **Unique Key**: `player_name` + `eloboard_id`.
- **Sync Status**: 
    - `pending`: 로스터에는 있으나 상세 전적은 없는 상태.
    - `verified`: 상세 전적까지 모두 수집 완료된 상태.

---

## 🧪 실험적 검증 단계 (Validation Roadmap)

| 단계 | 실험 명칭 | 대상 | 내용 | 가시적 성과 |
| :--- | :--- | :--- | :--- | :--- |
| **Exp 1** | **로스터 추출 검증** | 늪지대 (NZU) | 대학별 페이지에서 명단/ID 추출 | 텍스트 리스트 출력 및 사용자 확인 |
| **Exp 2** | **상세 페이지 파싱 검증** | 샘플 5인 | 개인 상세 페이지의 전적 데이터 파싱 | JSON 구조화 데이터 출력 및 비교 |
| **Exp 3** | **통합 싱크 드라이 런** | 늪지대 전원 | 1+2 단계를 통합하여 DB 반영 | 실제 DB 데이터와 웹 데이터 대조 |
| **Final** | **전체 데이터 수집** | 전 대학 BJ | 전수 조사 및 전체 동기화 | 대시보드 및 통계 데이터 완성 |

---

## 🛠️ 도구함 (Scripts Location)
- `scripts/core/`: 최종 안정화된 수집 스크립트
- `scripts/utils/`: 공유 유틸리티 (DB 연결 등)
- `scripts/tools/`: **[중요]** 실험 및 검증용 테스트 스크립트

---
*본 계획서는 사용자 사후 승인 및 실험 결과에 따라 지속적으로 업데이트됩니다.*
