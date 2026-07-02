$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root "rotacion-rural-app"
$deploy = Join-Path $root ".cloudflare-deploy"

if (Test-Path $deploy) {
  Remove-Item -LiteralPath $deploy -Recurse -Force
}

New-Item -ItemType Directory -Path $deploy | Out-Null

$publicFiles = @(
  "index.html",
  "styles.css",
  "app.js",
  "aws-config.js",
  "service-worker.js",
  "manifest.webmanifest"
)

foreach ($file in $publicFiles) {
  Copy-Item -LiteralPath (Join-Path $source $file) -Destination $deploy
}

Copy-Item -LiteralPath (Join-Path $source "assets") -Destination (Join-Path $deploy "assets") -Recurse

npx wrangler@latest deploy $deploy --name rotacion-rural-totoe --compatibility-date 2026-07-02
