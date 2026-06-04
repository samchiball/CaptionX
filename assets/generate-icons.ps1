# CaptionX Icon and Logo Generator Script
# Uses .NET System.Drawing in PowerShell to resize assets and bundle them.

Add-Type -AssemblyName System.Drawing

$sourcePath = "c:\Users\kwk13\captionX\assets\logo\logo.png"
$buildDir = "c:\Users\kwk13\captionX\build"
$resourcesDir = "c:\Users\kwk13\captionX\resources"
$rendererAssetsDir = "c:\Users\kwk13\captionX\src\renderer\src\assets"

# 1. Create directories if they don't exist
Write-Host "Creating target directories..."
if (!(Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir | Out-Null }
if (!(Test-Path $resourcesDir)) { New-Item -ItemType Directory -Path $resourcesDir | Out-Null }
if (!(Test-Path $rendererAssetsDir)) { New-Item -ItemType Directory -Path $rendererAssetsDir | Out-Null }

# 2. Resize function
function Resize-Image {
    param(
        [System.Drawing.Image]$SourceImage,
        [int]$Width,
        [int]$Height,
        [string]$OutputPath
    )
    Write-Host "Resizing to ${Width}x${Height} -> $OutputPath"
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $destImage = New-Object System.Drawing.Bitmap($Width, $Height)
    $destImage.SetResolution($SourceImage.HorizontalResolution, $SourceImage.VerticalResolution)
    
    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $wrapMode = New-Object System.Drawing.Imaging.ImageAttributes
    $wrapMode.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    
    $graphics.DrawImage($SourceImage, $destRect, 0, 0, $SourceImage.Width, $SourceImage.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrapMode)
    $graphics.Dispose()
    
    $destImage.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destImage.Dispose()
}

# 3. ICO Conversion Function
function Convert-PngsToIco {
    param(
        [string[]]$pngPaths,
        [string]$outputPath
    )
    Write-Host "Bundling PNGs into ICO: $outputPath"
    $fs = [System.IO.File]::Create($outputPath)
    $w = New-Object System.IO.BinaryWriter($fs)
    
    # Header
    $w.Write([uint16]0)
    $w.Write([uint16]1) # 1 = Icon
    $w.Write([uint16]$pngPaths.Count)
    
    $offset = 6 + ($pngPaths.Count * 16)
    $pngBytesList = New-Object System.Collections.Generic.List[byte[]]
    
    foreach ($path in $pngPaths) {
        $bytes = [System.IO.File]::ReadAllBytes($path)
        $pngBytesList.Add($bytes)
    }
    
    for ($i = 0; $i -lt $pngPaths.Count; $i++) {
        $path = $pngPaths[$i]
        $bytes = $pngBytesList[$i]
        
        $img = [System.Drawing.Image]::FromFile($path)
        $width = $img.Width
        $height = $img.Height
        $img.Dispose()
        
        $wWidth = if ($width -ge 256) { 0 } else { [byte]$width }
        $wHeight = if ($height -ge 256) { 0 } else { [byte]$height }
        
        $w.Write([byte]$wWidth)
        $w.Write([byte]$wHeight)
        $w.Write([byte]0)
        $w.Write([byte]0)
        $w.Write([uint16]1)
        $w.Write([uint16]32)
        $w.Write([uint32]$bytes.Length)
        $w.Write([uint32]$offset)
        
        $offset += $bytes.Length
    }
    
    foreach ($bytes in $pngBytesList) {
        $w.Write($bytes)
    }
    
    $w.Close()
    $fs.Close()
}

# 4. Load Source Image
$sourceImg = [System.Drawing.Image]::FromFile($sourcePath)

# 5. Save UI and Window icons
Resize-Image $sourceImg 256 256 "$rendererAssetsDir\logo.png"
Resize-Image $sourceImg 256 256 "$resourcesDir\icon.png"
Resize-Image $sourceImg 512 512 "$buildDir\icon.png"

# 6. Save temporary sizes for ICO creation
$icoSizes = @(16, 32, 48, 64, 128, 256)
$tempPngs = @()

foreach ($size in $icoSizes) {
    $tempPath = "$buildDir\temp_icon_${size}.png"
    Resize-Image $sourceImg $size $size $tempPath
    $tempPngs += $tempPath
}

# Dispose source image
$sourceImg.Dispose()

# 7. Convert to ICO
Convert-PngsToIco $tempPngs "$buildDir\icon.ico"

# 8. Clean up temporary PNGs
Write-Host "Cleaning up temporary files..."
foreach ($tempPath in $tempPngs) {
    if (Test-Path $tempPath) {
        Remove-Item $tempPath -Force
    }
}

Write-Host "All assets generated successfully!"
