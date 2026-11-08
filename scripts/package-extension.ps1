# Builds dist/tweet-grabber.zip with only the extension's files and no metadata:
# fixed dates, no local paths, and PNGs reduced to the chunks needed to draw them.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

$root = Split-Path $PSScriptRoot -Parent
$files = @(
  'LICENSE', 'manifest.json', 'background.js', 'content.js', 'content.css', 'filename.js', 'page-hook.js',
  'popup.html', 'popup.css', 'popup.js',
  'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'
)
$pngChunksToKeep = 'IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'
$fixedDate = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

function Remove-PngMetadata([byte[]]$png) {
  $output = New-Object IO.MemoryStream
  $output.Write($png, 0, 8) # PNG signature
  $position = 8
  while ($position -lt $png.Length) {
    $length = ([int]$png[$position] -shl 24) + ([int]$png[$position + 1] -shl 16) +
              ([int]$png[$position + 2] -shl 8) + [int]$png[$position + 3]
    $type = [Text.Encoding]::ASCII.GetString($png, $position + 4, 4)
    $chunkSize = 12 + $length # length + type + data + checksum
    if ($pngChunksToKeep -contains $type) { $output.Write($png, $position, $chunkSize) }
    $position += $chunkSize
  }
  $output.ToArray()
}

function Read-ExtensionFile([string]$name) {
  $path = Join-Path $root $name
  if ($name -like '*.png') { return , (Remove-PngMetadata ([IO.File]::ReadAllBytes($path))) }
  # Same line endings on every machine, whatever Git did on checkout.
  $text = [IO.File]::ReadAllText($path) -replace "`r`n", "`n"
  , ((New-Object Text.UTF8Encoding $false).GetBytes($text))
}

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path $dist 'tweet-grabber.zip'
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$stream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew)
$archive = New-Object IO.Compression.ZipArchive $stream, ([IO.Compression.ZipArchiveMode]::Create)
foreach ($name in $files) {
  $bytes = Read-ExtensionFile $name
  $entry = $archive.CreateEntry("tweet-grabber/$name", [IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = $fixedDate
  $target = $entry.Open()
  $target.Write($bytes, 0, $bytes.Length)
  $target.Close()
}
$archive.Dispose()
$stream.Close()

"Built $zipPath ($((Get-Item $zipPath).Length) bytes, $($files.Count) files)"
