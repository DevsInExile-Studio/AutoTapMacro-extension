$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskExtensionRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskChromeRoot = Join-Path $taskExtensionRoot 'chrome'
$taskManifest = Get-Content -LiteralPath (Join-Path $taskChromeRoot 'manifest.json') -Raw | ConvertFrom-Json
$taskDistRoot = Join-Path $taskExtensionRoot 'dist'
New-Item -ItemType Directory -Path $taskDistRoot -Force | Out-Null
$taskReleasePath = Join-Path $taskDistRoot "AutoTap-Macro-Chrome-v$($taskManifest.version).zip"
if (Test-Path -LiteralPath $taskReleasePath) { Remove-Item -LiteralPath $taskReleasePath }
[System.IO.Compression.ZipFile]::CreateFromDirectory($taskChromeRoot, $taskReleasePath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$taskStoreRoot = Join-Path $taskExtensionRoot 'store'
Copy-Item -LiteralPath (Join-Path $taskChromeRoot 'assets\icon-128.png') -Destination (Join-Path $taskStoreRoot 'icon-128.png')
$taskStoreZip = Join-Path $taskDistRoot 'AutoTap-Macro-Store-Assets.zip'
if (Test-Path -LiteralPath $taskStoreZip) { Remove-Item -LiteralPath $taskStoreZip }
$taskArchive = [System.IO.Compression.ZipFile]::Open($taskStoreZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $taskScreenshots = @(Get-Content -LiteralPath (Join-Path $taskStoreRoot 'screenshots.json') -Raw | ConvertFrom-Json)
  if ($taskScreenshots.Count -ne 5) { throw 'Expected five Chrome Web Store screenshots.' }
  $taskAssets = @('promo-440x280.png', 'promo-1400x560.png') + @($taskScreenshots | ForEach-Object { $_.file }) + @('icon-128.png')
  foreach ($taskAsset in $taskAssets) {
    if ([System.IO.Path]::GetFileName($taskAsset) -ne $taskAsset) { throw 'Asset names must not contain a directory.' }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, (Join-Path $taskStoreRoot $taskAsset), $taskAsset, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $taskArchive.Dispose() }
$taskHash = (Get-FileHash -LiteralPath $taskReleasePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $taskDistRoot "AutoTap-Macro-Chrome-v$($taskManifest.version).sha256.txt") -Value "$taskHash  $([System.IO.Path]::GetFileName($taskReleasePath))" -Encoding Ascii
Get-Item -LiteralPath $taskReleasePath, $taskStoreZip | Select-Object Name, Length
