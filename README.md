# NZU Homepage (늪지대 홈커밍)

산박(Sanpark)님의 1인 AI 기업 'Sanpark'의 프로젝트, NZU(늪지대) 대학 팀을 위한 프리미엄 홈페이지 및 데이터 시스템입니다.

## 🚀 개요
- **기술 스택**: Next.js (App Router), Supabase, Vanilla CSS
- **주요 기능**: 
  - Eloboard 데이터 실시간 동기화 (스크레이핑)
  - 대학별 라이브 스트리밍 상태 및 명단 관리
  - LCK 스타일의 미니멀리즘 UI

## 🛠️ 시작하기 (다른 PC에서 작업 시)

### 1. 환경 변수 설정
프로젝트 루트에 `.env.local` 파일을 생성하고 아래 내용을 입력하세요. (값은 Supabase 대시보드에서 확인)
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. 패키지 설치
```bash
npm install
```

### 3. 로컬 서버 실행
```bash
npm run dev
```

## 📂 주요 스크립트 (scripts/)
데이터 동기화 및 검증을 위한 유틸리티들입니다.

- `node scripts/sync-players-final.js`: Eloboard에서 최신 선수 명단 및 전적 동기화
- `node scripts/check-univ.js`: 특정 대학의 명단 매칭 확인
- `node scripts/inspect-guramis.js`: 특정 선수(구라미 등)의 데이터 디버깅

## 🎨 디자인 철학
- **Theme**: Dark / Rolex Green Accents
- **UI**: Dashboard-like layout, Information-first approach.
