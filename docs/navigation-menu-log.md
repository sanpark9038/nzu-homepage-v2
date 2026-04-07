# Navigation Menu Log

이 문서는 현재 숨김 처리된 내비게이션 요소와 복구 방법을 기록한다.
새 터미널이나 새 세션에서 작업하더라도, 이 문서와 관련 설정 파일을 보면 어떤 메뉴를 다시 살려야 하는지 바로 판단할 수 있어야 한다.

## 기준 파일

- 현재 상단 메뉴 표시/숨김 목록: [lib/navigation-config.ts](/C:/Users/NZU/Desktop/nzu-homepage/lib/navigation-config.ts)
- 현재 상단 메뉴 렌더링: [components/Navbar.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/Navbar.tsx)
- 현재 좌측 사이드바 표시 여부: [app/layout.tsx](/C:/Users/NZU/Desktop/nzu-homepage/app/layout.tsx)
- 좌측 사이드바 구현: [components/SidebarNav.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/SidebarNav.tsx)

## 현재 표시 중인 상단 메뉴

- 홈
- 승부예측
- 대회일정
- 팀 및 선수 순위
- 선수
- 상대전적

## 현재 숨김 처리된 상단 메뉴

### 링크 메뉴

- 티어표
  - 경로: `/tier`
  - 상태: 숨김
  - 복구 방법: `hiddenNavbarLinks`에서 `visibleNavbarLinks`로 이동

- 엔트리
  - 경로: `/entry`
  - 상태: 숨김
  - 복구 방법: `hiddenNavbarLinks`에서 `visibleNavbarLinks`로 이동

### 유틸리티 메뉴

- 검색바
  - 상태: 숨김
  - 원래 역할: 선수, 대학, 전적 검색용 입력 UI
  - 복구 위치: [components/Navbar.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/Navbar.tsx)

- 메시지 아이콘
  - 상태: 숨김
  - 원래 역할: 우측 유틸 아이콘 버튼
  - 복구 위치: [components/Navbar.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/Navbar.tsx)

- 알람 아이콘
  - 상태: 숨김
  - 원래 역할: 우측 유틸 아이콘 버튼
  - 복구 위치: [components/Navbar.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/Navbar.tsx)

## 현재 숨김 처리된 전역 내비게이션

### 좌측 사이드바

- 상태: 숨김
- 제어 방식: `SHOW_LEFT_SIDEBAR = false`
- 위치: [app/layout.tsx](/C:/Users/NZU/Desktop/nzu-homepage/app/layout.tsx)
- 실제 구현: [components/SidebarNav.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/SidebarNav.tsx)

#### 사이드바 안에 들어 있는 기능성 항목

- LIVE
- EXPLORE
- MY
- E-SPORTS
- STORE
- STATS
- EVENTS
- 하단 설정 버튼

주의:
- 이 사이드바는 현재 상단 메뉴 구조와 별도로 설계된 UI다.
- 다시 살릴 경우 상단 메뉴와 역할이 겹치는지 먼저 확인해야 한다.
- 단순히 `SHOW_LEFT_SIDEBAR`만 `true`로 바꾸면 레이아웃은 살아나지만, 실제 정보 구조는 현 시점 기획과 맞지 않을 수 있다.

## 복구 원칙

1. 숨김 링크 메뉴 복구
   - [lib/navigation-config.ts](/C:/Users/NZU/Desktop/nzu-homepage/lib/navigation-config.ts) 에서 대상 메뉴를 `hiddenNavbarLinks`에서 `visibleNavbarLinks`로 이동

2. 숨김 유틸리티 복구
   - [components/Navbar.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/Navbar.tsx) 에서 검색바 또는 아이콘 렌더링 블록을 다시 활성화

3. 좌측 사이드바 복구
   - [app/layout.tsx](/C:/Users/NZU/Desktop/nzu-homepage/app/layout.tsx) 의 `SHOW_LEFT_SIDEBAR`를 `true`로 변경
   - 필요 시 [components/SidebarNav.tsx](/C:/Users/NZU/Desktop/nzu-homepage/components/SidebarNav.tsx) 의 메뉴 구성도 함께 점검

## 운영 메모

- 이후 사용자가 "숨겨놨던 메뉴 보여줘"라고 요청하면 이 문서를 기준으로 목록을 먼저 보여준다.
- 이후 사용자가 "어떤 메뉴를 다시 살릴지" 선택하면, 이 문서와 `navigation-config.ts`를 기준으로 해당 항목만 복구한다.
- 앞으로 숨기는 내비게이션 요소가 추가되면 이 문서도 같이 갱신한다.
