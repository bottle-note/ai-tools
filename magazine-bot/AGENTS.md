# Magazine Bot - AI Agent Guide

## 개요
인스타그램 위스키 매거진 자동화 디스코드 봇. Human-in-the-loop 5단계 워크플로우.

## 기술 스택
- TypeScript + Node.js (ESM)
- discord.js v14
- OpenAI API (gpt-4o)
- SQLite (better-sqlite3)
- Express (Figma 플러그인 API)
- Figma Plugin API

## 디렉토리 구조

### src/bot/ — Discord 봇
- `client.ts`: Discord 클라이언트 설정
- `commands/magazine-start.ts`: `/magazine-start` 슬래시 커맨드 (워크플로우 시작점)
- `interactions/`: 버튼/모달/셀렉트메뉴 핸들러
  - `topic-select.ts`: 주제 선택 (Stage 1)
  - `content-review.ts`: 콘텐츠 승인/수정 (Stage 2)
  - `image-collect.ts`: MJ 이미지 수집 (Stage 3)
  - `layout-ready.ts`: Figma 레이아웃 완료 (Stage 4)
  - `final-complete.ts`: 최종 완료 (Stage 5)

### src/workflow/ — 워크플로우 엔진
- `machine.ts`: 스테이지 정의 + 전이 규칙 (TOPIC_SELECTION → CONTENT_WRITING → IMAGE_GENERATION → FIGMA_LAYOUT → FINAL_OUTPUT → COMPLETE)
- `engine.ts`: 상태 전이 함수 (startIssue, advanceStage, rejectStage)
- `stages/`: 각 스테이지 핸들러 (AI 호출 + Discord 메시지 생성)

### src/services/ — 외부 서비스
- `openai.ts`: GPT-4o 통합 (주제 생성, 콘텐츠 작성, 캡션 생성). `loadPrompt()` 으로 src/prompts/*.md 로드
- `midjourney.ts`: MJ 프롬프트 빌더 + 디스코드 채널에서 이미지 수집
- `figma-bridge.ts`: Figma 플러그인 완료 시 Discord 알림

### src/api/ — REST API
- `server.ts`: Express 서버. Figma 플러그인이 카드 데이터를 가져가는 엔드포인트

### src/db/ — 데이터베이스
- `schema.ts`: SQLite 테이블 정의 (magazine_issues, stage_data)
- `index.ts`: DB 싱글턴 + CRUD 헬퍼

### src/prompts/ — AI 프롬프트
- `topic-selection.md`: 주제 후보 생성 시스템 프롬프트
- `content-writing.md`: 캐러셀 카드 콘텐츠 시스템 프롬프트
- `caption.md`: 인스타 캡션 + 해시태그 시스템 프롬프트

### figma-plugin/ — Figma 플러그인 (별도 빌드)
- `manifest.json`: 플러그인 메타데이터
- `code.ts`: Figma 샌드박스 코드 (템플릿 복제 + 텍스트/이미지 교체)
- `ui.html`: 플러그인 UI (API에서 데이터 fetch → 배치 실행)

## 핵심 패턴

### 워크플로우 상태 머신
모든 스테이지는 `machine.ts`의 TRANSITIONS 맵을 따름. `engine.ts`가 DB 상태를 관리하고, 각 stage handler가 Discord UI + AI 호출을 담당.

### 인터랙션 라우팅
`src/index.ts`에서 버튼 customId prefix로 핸들러 분기:
- `topic_*` → topic-select.ts
- `content_*` → content-review.ts
- `image_*` → image-collect.ts
- `layout_*` → layout-ready.ts
- `final_*` → final-complete.ts

### 스테이지 데이터
각 스테이지 결과는 `stage_data` 테이블에 JSON으로 저장. 다음 스테이지가 이전 데이터를 DB에서 조회.

## 환경변수
`.env.example` 참고. 필수: DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, OPENAI_API_KEY, MJ_CHANNEL_ID, MAGAZINE_CHANNEL_ID

## 실행
```bash
npm install
npm run deploy-commands  # Discord 커맨드 등록
npm run dev              # 개발 서버
```
