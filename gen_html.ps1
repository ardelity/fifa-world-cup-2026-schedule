# Builds index.html from matches.json (re-run after refreshing matches.json to pick up new scores)
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$json = Get-Content (Join-Path $dir 'matches.json') -Raw

$template = Get-Content (Join-Path $dir 'template.html') -Raw
$template.Replace('/*__MATCHES__*/[]', $json) | Set-Content (Join-Path $dir 'index.html') -Encoding utf8NoBOM
Write-Host "index.html generated from matches.json"
