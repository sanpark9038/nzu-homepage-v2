# 📅 NZU 프로젝트: 내일의 작업 및 질문 사항 (2026-03-20)

## ❓ 사용자 질문 (중요)
1. **데이터 경량화 및 효율**: `nzu_roster.html` 파일을 보니 불필요한 태그와 내용이 매우 많습니다. 시스템의 경량화와 효율을 위해 추출 후 원본 HTML에서 필요한 핵심 정보만 남기거나 제거하는 프로세스가 필요하지 않을까요?

## 🚀 내일 이어서 할 작업
- [x] **늪지대 로스터 ID 매핑 완수** (2026-03-20 반영 완료)
  - 대상 URL: [all_bj_list&univ_name=늪지대](https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80)
  - 완료 (기존 3명): 정연이(424), 지아송(981), 아링(953)
  - 완료 (추가 11명): 쌍디(671), 인치호(150), 전흥식(100), 김성제(207), 서기수(208), 애공(223), 슬아(57), 슈슈(668), 예실(846), 연블비(627), 다라츄(927)
  - 반영 파일: `scripts/player_metadata.json` (`wr_id + gender` 복합키 기준)

- [x] **로스터 HTML 경량화/핵심 추출 프로세스 정리** (2026-03-20 완료)
  - 추가: `scripts/tools/extract-roster-core.js`
  - 개선: `scripts/tools/trim_roster.py` (하드코딩 경로 제거, CLI 인자 방식)
  - 수정: `scripts/tools/map-nzu-roster.js` 복합키 함수 사용 버그 교정

## 💡 참고 데이터 (오늘 완료분)
| 이름 | 티어 | 종족 | wr_id |
| :--- | :---: | :---: | :---: |
| **정연이** | 8 | Protoss | 424 |
| **지아송** | 8 | Protoss | 981 |
| **아링** | 8 | Protoss | 953 |

---
*NZU Homepage v2 - Data Reconstruction Phase*
