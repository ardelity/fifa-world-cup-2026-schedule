# Builds index.html from matches.json (re-run after refreshing matches.json to pick up new scores).
# bracket.json, if present, is baked in too so the knockout view works offline (file://).
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$json = Get-Content (Join-Path $dir 'matches.json') -Raw

$html = (Get-Content (Join-Path $dir 'template.html') -Raw).Replace('/*__MATCHES__*/[]', $json)

$bracketPath = Join-Path $dir 'bracket.json'
if (Test-Path $bracketPath) {
  $bracket = Get-Content $bracketPath -Raw
  $html = $html.Replace('/*__BRACKET__*/null', $bracket)
  Write-Host "index.html generated from matches.json + bracket.json"
} else {
  Write-Host "index.html generated from matches.json (no bracket.json — knockout view will load it at runtime)"
}
$html | Set-Content (Join-Path $dir 'index.html') -Encoding utf8NoBOM
