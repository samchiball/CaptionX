# scripts/setup-build-env.ps1
# --features full 빌드 전 BINDGEN 환경 변수를 자동 설정한다.
# 로컬: . .\scripts\setup-build-env.ps1
# CI:   PowerShell -File scripts/setup-build-env.ps1; cargo build --features full

Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'

# ── LLVM clang 탐색 ──────────────────────────────────────────────────────────
$clangExe = Get-Command clang -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue

if (-not $clangExe) {
    # winget 기본 설치 경로
    $clangExe = "C:\Program Files\LLVM\bin\clang.exe"
}
if (-not (Test-Path $clangExe)) {
    Write-Error "clang.exe 를 찾을 수 없습니다. winget install LLVM.LLVM 으로 설치하세요."
    exit 1
}

$llvmBin = Split-Path $clangExe -Parent
$env:LIBCLANG_PATH = $llvmBin

# clang 내장 헤더 (stdbool.h 등)
$resourceDir = & $clangExe --print-resource-dir 2>$null
if (-not $resourceDir) {
    Write-Error "clang --print-resource-dir 실패"
    exit 1
}
$clangInclude = Join-Path $resourceDir "include"

# ── MSVC CRT 헤더 (vcruntime.h 등) ───────────────────────────────────────────
$vswhereExe = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhereExe)) {
    Write-Error "vswhere.exe 없음 — VS Build Tools 2022 설치 필요"
    exit 1
}

$vsPath = & $vswhereExe -latest -products '*' `
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
    -property installationPath 2>$null

if (-not $vsPath) {
    Write-Error "MSVC C++ 툴셋을 찾을 수 없습니다."
    exit 1
}

$msvcVersionDir = Get-ChildItem "$vsPath\VC\Tools\MSVC" |
    Sort-Object Name -Descending | Select-Object -First 1
$msvcInclude = "$($msvcVersionDir.FullName)\include"

# ── Windows SDK ucrt 헤더 (stdio.h 등) ───────────────────────────────────────
$sdkRoot = "C:\Program Files (x86)\Windows Kits\10\Include"
$sdkVersion = Get-ChildItem $sdkRoot |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name
$ucrtInclude = "$sdkRoot\$sdkVersion\ucrt"

if (-not (Test-Path $ucrtInclude)) {
    Write-Error "Windows SDK ucrt 헤더를 찾을 수 없습니다: $ucrtInclude"
    exit 1
}

# ── 공백 처리: 경로를 -I 플래그로 직접 조합 ──────────────────────────────────
# shlex 파싱: 공백 포함 경로는 따옴표로 감싸야 함
function Escape-ClangArg([string]$path) {
    if ($path -match ' ') { return "`"-I$path`"" }
    return "-I$path"
}

$args = @(
    (Escape-ClangArg $clangInclude),
    (Escape-ClangArg $msvcInclude),
    (Escape-ClangArg $ucrtInclude)
) -join ' '

$env:BINDGEN_EXTRA_CLANG_ARGS = $args

Write-Host "LIBCLANG_PATH        = $env:LIBCLANG_PATH"
Write-Host "BINDGEN_EXTRA_CLANG_ARGS = $env:BINDGEN_EXTRA_CLANG_ARGS"
Write-Host ""
Write-Host "환경 변수 설정 완료. 이 세션에서 cargo build --features full 을 실행하세요."
