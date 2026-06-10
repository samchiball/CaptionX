# scripts/download-models.ps1
# Whisper GGUF 모델을 Hugging Face에서 다운로드하여 models_dir에 저장한다.
#
# 사용법:
#   .\scripts\download-models.ps1 -Model base
#   .\scripts\download-models.ps1 -Model small -Quantized
#   .\scripts\download-models.ps1 -Model large-v3-turbo

param(
    [Parameter(Mandatory)]
    [ValidateSet('tiny','base','small','medium','large-v3-turbo','large-v3')]
    [string]$Model,

    [switch]$Quantized,

    # 저장 경로 (기본: 앱 데이터 폴더)
    [string]$DestDir = "$env:APPDATA\com.stelbite.captionx\models"
)

$ErrorActionPreference = 'Stop'

# 파일명 결정
if ($Quantized) {
    $suffix = if ($Model -in 'tiny','base','small') { '-q5_1' } else { '-q5_0' }
} else {
    $suffix = ''
}
$fileName = "ggml-$Model$suffix.bin"
$destPath = Join-Path $DestDir $fileName

# 이미 존재하면 건너뜀
if (Test-Path $destPath) {
    Write-Host "$fileName 이미 존재합니다: $destPath"
    exit 0
}

# Hugging Face ggerganov/whisper.cpp 레포 기준 URL
$hfBase = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
$url = "$hfBase/$fileName"

Write-Host "다운로드 중: $url"
Write-Host "저장 위치  : $destPath"

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$tmp = "$destPath.part"
try {
    $ProgressPreference = 'SilentlyContinue'  # 속도 향상
    Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
    Move-Item -Path $tmp -Destination $destPath -Force
    Write-Host "완료: $destPath"
} catch {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Write-Error "다운로드 실패: $_"
    exit 1
}
