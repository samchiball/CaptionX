# CaptionX — Claude Code 프로젝트 가이드

Whisper 전사 + wav2vec2 단어 레벨 강제정렬 데스크톱 앱 (Tauri v2 + React + TypeScript + Rust).

## 개발 원칙 — TDD 필수

**모든 개발·수정·기능 추가는 TDD 사이클을 따른다: RED → GREEN → REFACTOR**

1. **테스트 먼저** — 구현 전에 실패하는 테스트를 작성한다.
2. **RED 검증 필수** — 테스트가 실제로 실패해야 다음 단계로 진행한다. 컴파일 에러도 RED로 인정.
3. **최소 구현** — 테스트를 통과시키는 최소한의 코드만 작성한다.
4. **GREEN 검증 후 커밋** — 테스트 통과를 확인하고 즉시 커밋한다.
5. **해피패스 금지** — 에러 경로·경계값·불변식을 반드시 테스트한다.

### Rust 테스트 명령어
```bash
# dev 서버(npm run dev) 실행 중일 때 — captionx.exe 잠금 우회
cargo t --manifest-path src-tauri/Cargo.toml --no-default-features

# dev 서버 미실행 시 전체 테스트
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features

# 출력 표시
cargo t --manifest-path src-tauri/Cargo.toml --no-default-features -- --nocapture
```
> `cargo t` = `cargo test --lib --tests` (`.cargo/config.toml` 별칭). `tauri dev`가 `captionx.exe`를 점유하는 동안 일반 `cargo test`는 os error 32로 실패하므로 반드시 `cargo t` 사용.

### TypeScript 테스트 명령어
```bash
npm run test       # Vitest 전체
npm run check      # biome + typecheck + knip + vitest 통합 검사
```

### TDD Git 체크포인트 패턴
```
test: add reproducer for <기능/버그>   ← RED 검증 후
fix:  <기능/버그>                      ← GREEN 검증 후
refactor: clean up <기능/버그>         ← 리팩터 완료 후 (선택)
```

## 프로젝트 스킬

| 슬래시 커맨드 | 용도 |
|---|---|
| `/tdd-workflow` | TDD 사이클 전체 절차 (RED→GREEN→REFACTOR) |
| `/rust-testing` | Rust 테스트 패턴 (유닛·통합·스모크) |
| `/refactor` | 코드 리팩토링 원칙·절차·안티패턴 |
| `/optimize` | 전사 파이프라인·메모리·React 렌더링 성능 최적화 |

## 자주 쓰는 명령어

```bash
npm run dev          # 개발 서버 (tauri dev)
npm run test         # Vitest 전체 실행
npm run check        # biome + typecheck + knip + vitest 통합 검사
npm run fix          # biome auto-fix
npm run build:win    # tauri build --features full (Windows)
```

## 핵심 파일 위치 (Tauri v2)

| 역할 | 경로 |
|---|---|
| 공유 타입 (TS) | `shared/types.ts` |
| Rust 공유 타입 | `src-tauri/src/types.rs` |
| Tauri 커맨드 등록 | `src-tauri/src/lib.rs` |
| IPC 커맨드 모음 | `src-tauri/src/commands/` |
| 전사 파이프라인 | `src-tauri/src/commands/transcribe.rs` |
| Whisper 추론 | `src-tauri/src/asr/whisper.rs` |
| 강제정렬 | `src-tauri/src/align/mod.rs` |
| 렌더러 진입점 | `src/App.tsx` |
| 배치/큐 훅 | `src/hooks/useBatch.ts` |
| TS→Rust API 레이어 | `src/api.ts` |

## 코드 규칙

- **린터/포맷터**: Biome (eslint/prettier 아님)
- **패키지 매니저**: npm (`package.json` scripts 사용)
- **테스트**: Vitest (`.test.ts` 파일)
- **공유 타입**: main↔renderer 공유 타입은 반드시 `shared/types.ts`에 추가
- **IPC**: Tauri `invoke` 및 `listen` 기반. `src/api.ts`의 `api` 객체를 통해 접근.
- **이벤트명**: `captionx://progress`, `captionx://model-progress` 등 커스텀 프로토콜 스타일 스킴 사용.

## 주의 사항

- `/models/` 는 `.gitignore`에 의해 추적되지 않음 (모델 파일 용량 문제)
- `TranscriptResult`는 수십~수백 MB — 작업 완료 후 `api.releaseResult` 호출 권장
- Rust 빌드 시 `--features full`을 사용해야 실제 전사 기능이 활성화됨 (LLVM/Clang 필요)
