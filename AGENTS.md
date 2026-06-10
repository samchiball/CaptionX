# AGENTS.md — CaptionX

A desktop subtitle transcription application for end-users running directly on Windows, macOS, and Linux.
Transcribes audio using Whisper (whisper.cpp) and produces word-level timestamps using wav2vec2 forced alignment.

## Language & Reasoning Guidelines (CRITICAL)

- **Thinking Language**: Always think, plan, and reason in English (within `<thought>` tags or internal reasoning steps).
- **Response Language**: Always output the final visible response in the same language as the user's input (e.g., if the user asks/inputs in Korean, respond in Korean; if the user asks/inputs in English, respond in English).


## Technology Stack

- **Runtime**: Tauri v2 + Rust (Backend) + Vite + React 19 + TypeScript (Frontend)
- **UI**: React 19 + TypeScript + Vite (`src/`)
- **Rust Backend**: `src-tauri/` — Tauri commands, whisper-rs, ort(ONNX)
- **Transcription**: `whisper-rs 0.16` (whisper.cpp FFI, `full` feature)
- **Alignment**: `ort 2.0.0-rc.12` (wav2vec2/MMS ONNX, `full` feature)
- **Decoding**: `ffmpeg-sidecar`

## Directory Structure

```
src/              React UI (Renderer)
src/hooks/        Hooks for batching, queues, and state
src/components/   UI Components
src/api.ts        TS → Rust IPC Bridge
shared/           TS Shared Types
src-tauri/        Rust Backend
  src/
    lib.rs        Tauri App entry point + command registration
    commands/     Tauri commands (@command functions)
    asr/          Whisper inference
    align/        CTC Forced Alignment (ctc.rs, vocab.rs)
    audio/        ffmpeg PCM decoding
    export/       SRT/VTT/JSON serialization
    edit/         resplit_result
    download/     reqwest streaming download
    state.rs      AppState (Model directory, results map)
    types.rs      Rust Shared Types
  tests/          Integration Tests (smoke.rs, pipeline.rs)
  examples/       Diagnostic Tools (whisper_smoke.rs)
```

---

## Development Principles — TDD Mandatory

**All development, modifications, and feature additions must follow the TDD cycle: RED → GREEN → REFACTOR**

### Core Rules

1. **Test First** — Write a failing test before writing the implementation. No exceptions.
2. **RED Verification Mandatory** — The test must actually fail (including compile errors) before proceeding to implementation.
   - A test that does not compile or run is not considered RED.
3. **Minimum Implementation** — Write only the minimum amount of code required to make the test pass.
4. **Commit after GREEN** — Verify the test passes and commit immediately.
5. **No Happy-Path Assumptions** — Always test error paths, boundary conditions, and invariants.
   - Do not rely on assumptions like "the data will always be correct".
   - Do not rely on assumptions like "the value will always exist".

### TDD Git Checkpoint Patterns

```
test: add reproducer for <feature/bug>   ← Commit immediately after RED verification
fix:  <feature/bug>                      ← Commit immediately after GREEN verification
refactor: clean up <feature/bug>         ← Commit after refactoring is complete (optional)
```

- Checkpoint commits must be reachable from the HEAD of the active branch to be valid.
- Commits on other branches or from past work do not qualify as checkpoints.

### Rust Test Commands

```bash
# While dev server (tauri dev) is running — bypasses captionx.exe file lock (prevents os error 32)
cargo t --manifest-path src-tauri/Cargo.toml --features full --no-default-features

# When dev server is not running — includes full build
cargo test --manifest-path src-tauri/Cargo.toml --features full --no-default-features

# Show output / Filter specific tests
cargo t --manifest-path src-tauri/Cargo.toml --features full --no-default-features -- --nocapture
cargo t --manifest-path src-tauri/Cargo.toml --features full --no-default-features -- resolve_threads
```

> `cargo t` is an alias defined in `.cargo/config.toml` for `test --lib --tests`.
> While `tauri dev` holds a lock on `captionx.exe`, standard `cargo test` fails with an "os error 32" file lock error.

### TypeScript Test Commands

```bash
npm run test       # Run all Vitest tests
npm run check      # Integrated check (biome + typecheck + knip + vitest)
npm run fix        # Biome auto-fix
```

---

## Code Quality — Continuous Checks (Mandatory)

Run the following checks **every time you create or modify code** to catch conflicts with existing code/tests immediately:

| Purpose | Command | Tool |
|---|---|---|
| Lint + Format + Fix | `npm run fix` | Biome |
| Complete Verification | `npm run check` | biome + typecheck + knip + vitest |
| Rust Check | `cargo clippy` | Clippy |
| Rust Format | `cargo fmt` | rustfmt |

Recommended loop: Modify files → `npm run fix && npm run typecheck` → Run related tests → `npm run check` before committing.

---

## Key Design Decisions & Pitfalls

### `resolve_threads` — Prevent crash when n_threads=0

Passing `set_n_threads(0)` to `whisper-rs` initializes the GGML thread pool with 0 workers, which throws an STL exception across the FFI boundary, leading to "Rust cannot catch foreign exceptions" → 0xC0000409 crash.
`resolve_threads()` in `src-tauri/src/asr/whisper.rs` automatically adjusts `Some(0)` or `None`.

### `full` Feature Gate

Since `whisper-rs` and `ort` require LLVM/clang, opt-in with `--features full`.
Renderer development, export, or edit tasks can be built without the `full` feature.

### Model Directory

Model files are stored in `%APPDATA%\CaptionX\models\` (Windows) and are listed in `.gitignore`.
Access them via `AppState.models_dir`. You must call `IPC.releaseResult` upon completion to free hundreds of MBs of memory.

---

## i18n — Internationalization (Mandatory)

- UI strings must only be displayed via the dictionary in `src/i18n/translations.ts`. No hardcoding allowed.
- The `ko` dictionary is the Source of Truth. When adding a new key, **immediately** populate the same key across all supported languages.
- Supported languages: Korean (ko), English (en), Japanese (ja), Simplified Chinese (zh-Hans), Traditional Chinese (zh-Hant), Spanish (es), French (fr), German (de).

---

## Git Conventions

- Commit messages must be written in English and follow standard commit conventions.
- Group similar changes together, and describe multiple changes on separate lines.
- Do NOT use the `@` character in commit messages (neither in the subject nor in the body).
- When passing messages using PowerShell here-strings (`@'...'@`), the closing `'@` must be placed at column 0.
