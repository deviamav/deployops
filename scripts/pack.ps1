# DeployOps - pack project into deployops.tar.gz
# Usage from repo root:
#   .\scripts\pack.ps1
# or:
#   powershell -ExecutionPolicy Bypass -File scripts\pack.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$tar = Get-Command tar -ErrorAction SilentlyContinue
if (-not $tar) {
  Write-Error "tar.exe not found. Need Windows 10 1803+ or install git-bash."
  exit 1
}

$out = "deployops.tar.gz"
if (Test-Path $out) { Remove-Item $out -Force }

$exclude = @(
  "node_modules",
  ".next",
  ".git",
  ".env",
  ".env.*",
  "uploads",
  "terminals",
  "tsconfig.tsbuildinfo",
  "deployops.tar.gz",
  ".vscode",
  ".idea",
  ".cursor",
  ".cursorignore",
  "audit.json",
  "*.log",
  "*.bak",
  "*.tmp",
  "*.zip"
)

$tarArgs = @("-czf", $out)
foreach ($e in $exclude) {
  $tarArgs += "--exclude=$e"
}
$tarArgs += "."

Write-Host ("tar " + ($tarArgs -join " "))
& tar @tarArgs
if ($LASTEXITCODE -ne 0) {
  Write-Error "tar failed with code $LASTEXITCODE"
  exit $LASTEXITCODE
}

$size = (Get-Item $out).Length
$sizeMb = [math]::Round($size / 1MB, 1)
Write-Host ""
Write-Host ("OK: created " + $out + " (" + $sizeMb + " MB)") -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  scp scripts/setup.sh deployops.tar.gz root@<IP>:/root/"
Write-Host "  ssh root@<IP>"
Write-Host "  then on the server, run as root:"
Write-Host "    DOMAIN=your.domain SSH_PUBLIC_KEY='ssh-ed25519 AAAA... key' MY_IP=your-ip ADMIN_EMAIL=admin@your.domain ADMIN_PASSWORD='ChangeMe' LE_EMAIL=admin@your.domain bash /root/setup.sh all"
