# AGENTS.md — CaptionX

Python 없이 win/mac/linux에서 바로 실행되는 자막 전사 데스크톱 앱.
Whisper(whisper.cpp)로 전사하고 wav2vec2 강제정렬로 단어 레벨 타임스탬프를 만든다.

## 기술 스택

- **런타임**: Electron 34 + electron-vite, ESM(`"type": "module"`)
- **UI**: React 19 + TypeScript + Vite (`src/renderer`)
- **메인 프로세스**: TypeScript (`src/main`), preload는 contextBridge로 안전 API만 노출
- **전사**: `smart-whisper` (whisper.cpp 네이티브 바인딩, GPU)
- **정렬**: `onnxruntime-node` (wav2vec2 CTC) + 자체 Viterbi 구현(`src/main/align/viterbi.ts`)
- **디코드**: `ffmpeg-static`
- 패키지 관리자: **npm** (이 프로젝트는 Node 프로젝트이므로 uv/pyproject 미사용 — Python을 쓰지 않는다)

## 디렉터리

```
src/main      메인 프로세스 (전사/정렬/디코드/내보내기 파이프라인)
src/preload   contextBridge API
src/renderer  React UI
shared        main↔renderer 공유 타입
```

## 코드 품질 — 지속적 검사 (필수)

코드를 **생성/수정할 때마다** 아래를 실행해 기존 코드/테스트와의 충돌을 즉시 잡는다.
작업 종료 시 한 번만 검사하지 말 것.

린트·포맷·임포트 정렬은 **Biome 하나로 통일**한다(ESLint/Prettier 미사용). 설정은 `biome.json`.

| 목적            | 명령                   | 도구                  |
| --------------- | ---------------------- | --------------------- |
| 린트            | `npm run lint`         | Biome (`biome lint`)  |
| 포맷            | `npm run format`       | Biome (`biome format`)|
| 포맷 검사       | `npm run format:check` | Biome                 |
| 린트+포맷+정렬  | `npm run fix`          | Biome (`check --write`)|
| 데드코드        | `npm run deadcode`     | knip                  |
| 타입 검사       | `npm run typecheck`    | tsc (node/web 분리)   |
| 테스트          | `npm run test`         | vitest                |
| **전체 게이트** | `npm run check`        | `biome check` + 위 전부|

권장 루프: 파일 수정 → `npm run fix && npm run typecheck` → 관련 테스트 → 커밋 전 `npm run check`.

## 테스트 정책 (TDD/BDD 지향)

- 순수 로직(`viterbi.ts`, `export/*`, 타임코드 포맷터)은 **테스트 먼저** 작성한다.
- 테스트는 동작(behavior) 단위로 기술하고, 합성 입력으로 결정적이게 유지한다.
- 새 코드가 **기존 테스트를 깨뜨리지 않는지** 매번 `npm run test`로 확인한다.
- 네이티브/모델 의존(whisper, onnx) 코드는 인터페이스를 분리해 순수 로직만 단위 테스트하고,
  실제 모델 경로는 통합 테스트(샘플 WAV)로 수동 검증한다.

## i18n — 다국어 (필수)

- UI 문자열은 **반드시** `src/renderer/src/i18n/translations.ts`의 사전을 통해서만 표시한다. 컴포넌트에 하드코딩 금지(`t('key')` 사용).
- `ko` 사전이 소스 오브 트루스다. 새 UI 문자열을 추가/수정하면 **즉시** 지원하는 모든 언어(`UI_LOCALES`)에 동일 키를 채워 넣는다 — 한 언어만 추가하고 나머지를 비워 두지 않는다.
- 지원 언어: 한국어(ko), English(en), 日本語(ja), 简体中文(zh-Hans), 繁體中文(zh-Hant), Español(es), Français(fr), Deutsch(de).
- 새 언어를 추가할 때: (1) `UI_LOCALES`에 코드 추가, (2) `UI_LOCALE_LABELS`에 자국어 라벨 추가, (3) `translations`에 `Messages` 타입을 만족하는 사전 추가, (4) 필요하면 `i18n/index.tsx`의 `detectDefaultLocale` 자동 감지 보완.
- 자리표시자(`{n}`, `{batch}` 등)는 언어마다 동일하게 유지한다.
- **매 작업마다** `src/renderer/src/i18n/i18n.test.ts`로 점검한다 — 모든 언어가 ko와 동일한 키 집합·빈 값 없음·자리표시자 일치를 보장한다. UI 문자열을 건드린 변경은 이 테스트 통과 없이 커밋하지 않는다.

## 문서화 및 다국어 지원 (Docs i18n)

- 메인 설명서인 `README.md`는 한국어(`ko`)가 소스 오브 트루스(Source of Truth)이자 최우선 순위입니다.
- `README.md`를 수정/갱신할 경우, 다른 언어 문서(`docs/README.en.md`, `docs/README.ja.md`, `docs/README.zh.md`)도 함께 최신 상태로 동기화하여 업데이트해야 합니다.
- 다국어 문서 작성 시 ECJK(English, Chinese, Japanese, Korean) 문서를 우선하여 최신 상태로 유지하십시오.

## 규약

- 코드 주석은 한국어 또는 영어.
- 파일은 ESM. 노드 빌트인은 `node:` 프리픽스 사용(`node:path`, `node:fs`).
- preload 외 렌더러에서 Node API 직접 접근 금지(contextIsolation 유지).
- 모델/대용량 산출물은 `models/`, `out/`, `release/`에 두고 커밋하지 않는다.

## Git 훅 — lefthook (필수)

- 커밋/푸시 훅은 **lefthook**으로 관리한다(`lefthook.yml`). `npm install` 시 `prepare` 스크립트가 자동 설치한다.
- `pre-commit`: 스테이징된 파일에 `biome check`(린트+포맷+임포트 정렬) 검사 및 `knip` 데드코드 검사.
- `pre-push`: `npm run typecheck` + `npm run test`.
- **훅 우회 금지.** `--no-verify`, `-n`, `LEFTHOOK=0`, `HUSKY=0`, `git commit`/`git push`의 훅 스킵 옵션 등 어떤 방식으로도 훅을 건너뛰지 않는다.
- 훅이 실패하면 우회하지 말고 **원인을 고친다**. 검사를 통과한 뒤에만 커밋/푸시한다.
- 훅 자체를 비활성화·삭제·약화(검사 항목 제거)하지 않는다. 변경이 필요하면 사용자에게 먼저 확인한다.

## git

- 표준 커밋 컨벤션을 사용
- 같은 성격의 변경사항끼리 묶어라
- 여러 변경사항은 여러줄로 표현하라
- 커밋 메시지에 `@` 문자 사용금지(제목·본문 모두). PowerShell here-string(`@'...'@`)으로 메시지 전달 시 시작 토큰이 본문에 섞이지 않도록 닫는 `'@`는 반드시 0열에 둘 것
