param(
    [string]$InstallRoot = 'D:\DSH-Desktop',
    [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$installPath = [IO.Path]::GetFullPath($InstallRoot)
if ([IO.Path]::GetPathRoot($installPath) -ne 'D:\') {
    throw 'The desktop installation and its runtime data must remain on D:.'
}
$executable = Join-Path $installPath 'app\DeepSeek Harness.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Desktop executable not found: $executable"
}
$signature = Get-AuthenticodeSignature -LiteralPath $executable
if ($signature.Status -ne 'Valid') {
    throw "Desktop executable signature is not valid: $($signature.Status)"
}
$homePath = Join-Path $installPath 'home'
$browserDataPath = Join-Path $installPath 'user-data'
$kontDataPath = Join-Path $installPath 'kont-data'
foreach ($directory in @($homePath, $browserDataPath, $kontDataPath)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

# The Electron Host inherits these values. Nothing is persisted to user/system
# environment variables, and the legacy CLI sandbox is not modified.
$env:DSH_HOME = $homePath
$env:KONT_DATA_DIR = $kontDataPath

if ($PrepareOnly) {
    [pscustomobject]@{
        executable = $executable
        version = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
        dshHome = $homePath
        electronUserData = $browserDataPath
        kontData = $kontDataPath
        activatesKnotPlugin = $false
    } | ConvertTo-Json
    exit 0
}

# This is the interactive desktop software requested by the user.
# Launching it does not install or activate the Knot plugin.
Start-Process -FilePath $executable -WorkingDirectory (Split-Path $executable) `
    -ArgumentList @("--user-data-dir=`"$browserDataPath`"")
