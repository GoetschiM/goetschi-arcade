# Pusht den aktuellen Stand nach GitHub und stoesst in Coolify einen Rebuild an.
#
# Der API-Token wird erwartet in $env:COOLIFY_TOKEN oder in der Datei .coolify-token
# (liegt in .gitignore, kommt also nicht ins Repo).

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$appUuid = 'dc5fp7ny50bjtfv45lar3v0n'
$coolify = 'http://10.0.60.139:8000'

$token = $env:COOLIFY_TOKEN
if (-not $token -and (Test-Path '.coolify-token')) {
    $token = (Get-Content '.coolify-token' -Raw).Trim()
}
if (-not $token) {
    Write-Error "Kein Coolify-Token. Setze `$env:COOLIFY_TOKEN oder lege .coolify-token an."
}

# 1) Aenderungen pushen (falls welche da sind)
if (git status --porcelain) {
    $msg = if ($args.Count) { $args -join ' ' } else { 'Arcade aktualisiert' }
    git add -A
    git commit -m $msg
}
git push origin main

# 2) Coolify neu bauen lassen
$headers = @{ Authorization = "Bearer $token" }
$r = Invoke-RestMethod -Uri "$coolify/api/v1/deploy?uuid=$appUuid&force=false" -Headers $headers
$dep = $r.deployments[0].deployment_uuid
Write-Host "Deployment gestartet: $dep"

# 3) Auf das Ergebnis warten
do {
    Start-Sleep -Seconds 6
    $s = (Invoke-RestMethod -Uri "$coolify/api/v1/deployments/$dep" -Headers $headers).status
    Write-Host "  Status: $s"
} while ($s -eq 'in_progress' -or $s -eq 'queued')

if ($s -eq 'finished') {
    Write-Host "`nFertig -> http://10.0.60.139:8099/" -ForegroundColor Green
} else {
    Write-Host "`nDeployment endete mit Status '$s' - Details in Coolify." -ForegroundColor Red
}
