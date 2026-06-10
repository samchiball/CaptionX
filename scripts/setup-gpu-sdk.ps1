# scripts/setup-gpu-sdk.ps1
# GPU SDK 경로를 자동 감지하고 .cargo/config.toml [env] 에 추가한다.
#
# 사용법:
#   . .\scripts\setup-gpu-sdk.ps1          # Vulkan + CUDA 모두 탐색
#   . .\scripts\setup-gpu-sdk.ps1 -Vulkan  # Vulkan 만
#   . .\scripts\setup-gpu-sdk.ps1 -Cuda    # CUDA 만
#
# 실행 후 npm run dev:vulkan / npm run dev:cuda 를 사용한다.

param(
    [switch]$Vulkan,
    [switch]$Cuda
)

Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'

$configPath = Join-Path $PSScriptRoot "..\. cargo\config.toml"
$configPath = (Resolve-Path (Join-Path $PSScriptRoot "..\.cargo\config.toml")).Path

# ── Vulkan SDK 감지 ────────────────────────────────────────────────────────────
function Find-VulkanSdk {
    # 1. 환경변수 (재시작 전이라면 이미 설정된 경우)
    if ($env:VULKAN_SDK -and (Test-Path $env:VULKAN_SDK)) {
        return $env:VULKAN_SDK
    }

    # 2. 레지스트리 — LunarG 설치 시 자동 생성
    $regPaths = @(
        "HKLM:\SOFTWARE\LunarG\VulkanSDK",
        "HKCU:\SOFTWARE\LunarG\VulkanSDK"
    )
    foreach ($reg in $regPaths) {
        try {
            $val = Get-ItemPropertyValue $reg -Name "(default)" -ErrorAction Stop
            if ($val -and (Test-Path $val)) { return $val }
        } catch {}
    }

    # 3. 파일시스템 — C:\VulkanSDK\<버전>
    $searchRoots = @("C:\VulkanSDK", "$env:ProgramFiles\VulkanSDK")
    foreach ($root in $searchRoots) {
        if (Test-Path $root) {
            $latest = Get-ChildItem $root -Directory |
                Sort-Object Name -Descending | Select-Object -First 1
            if ($latest -and (Test-Path "$($latest.FullName)\Lib\vulkan-1.lib")) {
                return $latest.FullName
            }
        }
    }

    return $null
}

# ── CUDA Toolkit 감지 ──────────────────────────────────────────────────────────
function Find-CudaPath {
    # 1. 환경변수
    if ($env:CUDA_PATH -and (Test-Path $env:CUDA_PATH)) {
        return $env:CUDA_PATH
    }

    # 2. 레지스트리
    $regBase = "HKLM:\SOFTWARE\NVIDIA Corporation\GPU Computing Toolkit\CUDA"
    try {
        $versions = Get-ChildItem $regBase -ErrorAction Stop |
            Sort-Object Name -Descending
        foreach ($v in $versions) {
            $path = Get-ItemPropertyValue $v.PSPath -Name "InstallDir" -ErrorAction SilentlyContinue
            if ($path -and (Test-Path $path)) { return $path }
        }
    } catch {}

    # 3. 파일시스템
    $cudaBase = "$env:ProgramFiles\NVIDIA GPU Computing Toolkit\CUDA"
    if (Test-Path $cudaBase) {
        $latest = Get-ChildItem $cudaBase -Directory |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($latest -and (Test-Path "$($latest.FullName)\bin\nvcc.exe")) {
            return $latest.FullName
        }
    }

    return $null
}

# ── .cargo/config.toml 업데이트 ───────────────────────────────────────────────
function Set-CargoEnv([string]$key, [string]$value) {
    $content = Get-Content $configPath -Raw
    # TOML 이스케이프: 백슬래시를 \\로
    $escaped = $value.Replace('\', '\\')

    if ($content -match "(?m)^$key\s*=") {
        # 기존 항목 교체
        $content = $content -replace "(?m)^$key\s*=.*$", "$key = `"$escaped`""
    } else {
        # [env] 섹션 끝에 추가
        $content = $content -replace "(\[env\][^\[]*)", "`$1$key = `"$escaped`"`n"
    }
    Set-Content $configPath $content -NoNewline
    Write-Host "  [config.toml] $key = `"$escaped`"" -ForegroundColor Green
}

# ── 실행 ──────────────────────────────────────────────────────────────────────
$doVulkan = $Vulkan -or (-not $Vulkan -and -not $Cuda)
$doCuda   = $Cuda   -or (-not $Vulkan -and -not $Cuda)

if ($doVulkan) {
    Write-Host "`n[Vulkan SDK]" -ForegroundColor Cyan
    $sdk = Find-VulkanSdk
    if ($sdk) {
        Write-Host "  발견: $sdk" -ForegroundColor Green
        Set-CargoEnv "VULKAN_SDK" $sdk
        $env:VULKAN_SDK = $sdk
        Write-Host "  이 세션: VULKAN_SDK=$sdk" -ForegroundColor Green
    } else {
        Write-Host "  Vulkan SDK 를 찾을 수 없습니다." -ForegroundColor Red
        Write-Host "  설치: https://vulkan.lunarg.com/sdk/home#windows" -ForegroundColor Yellow
        Write-Host "  설치 후 이 스크립트를 다시 실행하세요." -ForegroundColor Yellow
    }
}

if ($doCuda) {
    Write-Host "`n[CUDA Toolkit]" -ForegroundColor Cyan
    $cuda = Find-CudaPath
    if ($cuda) {
        Write-Host "  발견: $cuda" -ForegroundColor Green
        Set-CargoEnv "CUDA_PATH" $cuda
        $env:CUDA_PATH = $cuda
        Write-Host "  이 세션: CUDA_PATH=$cuda" -ForegroundColor Green
    } else {
        Write-Host "  CUDA Toolkit 을 찾을 수 없습니다." -ForegroundColor Red
        Write-Host "  설치: https://developer.nvidia.com/cuda-downloads" -ForegroundColor Yellow
        Write-Host "  설치 후 이 스크립트를 다시 실행하세요." -ForegroundColor Yellow
    }
}

Write-Host ""
if ($doVulkan -and (Find-VulkanSdk)) {
    Write-Host "Vulkan 빌드 준비 완료. 실행: npm run dev:vulkan" -ForegroundColor Green
}
if ($doCuda -and (Find-CudaPath)) {
    Write-Host "CUDA 빌드 준비 완료. 실행: npm run dev:cuda" -ForegroundColor Green
}
