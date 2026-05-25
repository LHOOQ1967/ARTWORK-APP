
[CmdletBinding()]
param(
    [string]$AllowedBranch = "main",
    [switch]$AllowDirty,
    [switch]$SkipLocalNpmCi,
    [switch]$SkipRemoteNpmCi,
    [switch]$SkipGitPush,
    [switch]$SkipTagPush,
    [switch]$SkipBranchPush
)

$ErrorActionPreference = "Stop"

# =========================
# ENCODAGE CONSOLE
# =========================
try {
    chcp 65001 > $null
} catch {}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# =========================
# CONFIG PROJET
# =========================
$ProjectPath = "C:\Users\Philippe\artwork-app"
$RemotePath  = "/srv/customer/sites/artmuse.ch"

$SshUser = "MbGYYMaq5xi_philippe"
$SshHost = "57-111324.ssh.hosting-ik.com"
$Remote  = "$SshUser@${SshHost}"

$ZipBaseName = "app1"
$RemoteBackupKeep = 7
$GitTagPrefix = "deploy-backup"

# Fichiers/dossiers à inclure dans le zip
$IncludePaths = @(
    ".next",
    "app",
    "components",
    "contexts",
    "lib",
    "public",
    "server",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "next.config.js",
    "next-env.d.ts",
    "tsconfig.json",
    "postcss.config.js",
    "postcss.config.mjs",
    "eslint.config.js",
    "README.md",
    "AGENTS",
    "deploy-manifest.json"
)

# =========================
# OUTILS
# =========================
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Ok {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host $Message -ForegroundColor DarkYellow
}

function Require-Success {
    param(
        [int]$ExitCode,
        [string]$ErrorMessage
    )
    if ($ExitCode -ne 0) {
        throw $ErrorMessage
    }
}

function Get-ExistingRelativePaths {
    param(
        [string]$BasePath,
        [string[]]$Candidates
    )

    $result = New-Object System.Collections.ArrayList
    foreach ($item in $Candidates) {
        $full = Join-Path $BasePath $item
        if (Test-Path $full) {
            [void]$result.Add($item)
        }
    }
    return $result
}

# =========================
# DEMARRAGE
# =========================
Set-Location $ProjectPath

$LogsDir = Join-Path $ProjectPath "deploy-logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

$ManifestHistoryDir = Join-Path $ProjectPath "deploy-manifests"
if (-not (Test-Path $ManifestHistoryDir)) {
    New-Item -ItemType Directory -Path $ManifestHistoryDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$DeployId = "prod_$Timestamp"
$ZipName = "${ZipBaseName}.zip"
$ZipPath = Join-Path $ProjectPath $ZipName
$LogFile = Join-Path $LogsDir "deploy_$Timestamp.log"
$ManifestPath = Join-Path $ProjectPath "deploy-manifest.json"
$ManifestArchivePath = Join-Path $ManifestHistoryDir "deploy_manifest_$Timestamp.json"

Start-Transcript -Path $LogFile -Append | Out-Null

try {
    Write-Step "VERIFICATION GIT"

    $insideGit = (git rev-parse --is-inside-work-tree 2>$null)
    if ($LASTEXITCODE -ne 0 -or $insideGit.Trim() -ne "true") {
        throw "Le dossier courant n'est pas un dépôt Git."
    }

    $CurrentBranch = (git branch --show-current).Trim()
    $CurrentCommit = (git rev-parse HEAD).Trim()
    $GitStatus = git status --porcelain

    Write-Info "Branche actuelle : $CurrentBranch"
    Write-Info "Commit actuel    : $CurrentCommit"

    if ($CurrentBranch -ne $AllowedBranch) {
        throw "Branche interdite pour ce déploiement. Branche actuelle = '$CurrentBranch', branche autorisée = '$AllowedBranch'."
    }

    if ($GitStatus -and -not $AllowDirty) {
        Write-Host ""
        Write-Host "Le repo contient des modifications non commit." -ForegroundColor Red
        git status --short
        Write-Host ""
        Write-Host "Solutions :" -ForegroundColor Red
        Write-Host "  1) commit tes changements" -ForegroundColor Red
        Write-Host "  2) ou relance avec -AllowDirty" -ForegroundColor Red
        throw "Déploiement interrompu : repo Git non propre."
    }

    if ($GitStatus -and $AllowDirty) {
        Write-Warn "Le repo n'est pas propre, mais -AllowDirty a été fourni."
        git status --short
    }

    Write-Step "CREATION DU TAG GIT DE SAUVEGARDE"

    $GitTag = "$GitTagPrefix-$Timestamp"
    $TagMessage = "Backup avant déploiement production artmuse.ch - $Timestamp"

    git tag -a $GitTag -m $TagMessage
    Require-Success $LASTEXITCODE "Impossible de créer le tag Git '$GitTag'."

    Write-Ok "Tag créé : $GitTag"

    if (-not $SkipGitPush) {
        Write-Step "PUSH GIT"

        if (-not $SkipBranchPush) {
            Write-Info "Push de la branche '$AllowedBranch' vers origin..."
            git push origin $AllowedBranch
            Require-Success $LASTEXITCODE "Le push de la branche '$AllowedBranch' a échoué."
            Write-Ok "Branche poussée."
        }
        else {
            Write-Warn "Push de la branche ignoré (-SkipBranchPush)."
        }

        if (-not $SkipTagPush) {
            Write-Info "Push du tag '$GitTag' vers origin..."
            git push origin $GitTag
            Require-Success $LASTEXITCODE "Le push du tag '$GitTag' a échoué."
            Write-Ok "Tag poussé."
        }
        else {
            Write-Warn "Push du tag ignoré (-SkipTagPush)."
        }
    }
    else {
        Write-Warn "Tous les push Git sont ignorés (-SkipGitPush)."
    }

    Write-Step "INSTALLATION ET BUILD LOCAL"

    if (-not $SkipLocalNpmCi) {
        Write-Info "npm ci local..."
        npm ci
        Require-Success $LASTEXITCODE "npm ci local a échoué."
    }
    else {
        Write-Warn "npm ci local ignoré (-SkipLocalNpmCi)."
    }

    Write-Info "Suppression de .next..."
    if (Test-Path ".next") {
        Remove-Item -Recurse -Force ".next"
    }

    Write-Info "Build production..."
    cmd /c "set NODE_ENV=production&& npm run build"
    Require-Success $LASTEXITCODE "Le build production a échoué."

    if (-not (Test-Path ".next\BUILD_ID")) {
        throw "Le fichier '.next\BUILD_ID' est absent après le build."
    }

    $LocalBuildId = (Get-Content ".next\BUILD_ID" -ErrorAction Stop | Select-Object -First 1).Trim()
    Write-Ok "BUILD_ID local : $LocalBuildId"

    Write-Step "GENERATION DU MANIFEST"

    $Manifest = [ordered]@{
        deploy_id          = $DeployId
        deployed_at_local  = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        project_path       = $ProjectPath
        environment        = "production"
        site               = "artmuse.ch"
        allowed_branch     = $AllowedBranch
        current_branch     = $CurrentBranch
        git_commit         = $CurrentCommit
        git_tag            = $GitTag
        build_id           = $LocalBuildId
        zip_name           = $ZipName
        remote_host        = $SshHost
        remote_user        = $SshUser
        remote_path        = $RemotePath
        skip_local_npm_ci  = [bool]$SkipLocalNpmCi
        skip_remote_npm_ci = [bool]$SkipRemoteNpmCi
        skip_git_push      = [bool]$SkipGitPush
        skip_branch_push   = [bool]$SkipBranchPush
        skip_tag_push      = [bool]$SkipTagPush
        allow_dirty        = [bool]$AllowDirty
    }

    $ManifestJson = $Manifest | ConvertTo-Json -Depth 10
    Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8
    Set-Content -Path $ManifestArchivePath -Value $ManifestJson -Encoding UTF8

    Write-Ok "Manifest généré : $ManifestArchivePath"

    Write-Step "CREATION DU ZIP"

    if (Test-Path $ZipPath) {
        Remove-Item -Force $ZipPath
    }

    $FilesToZip = Get-ExistingRelativePaths -BasePath $ProjectPath -Candidates $IncludePaths

    if ($FilesToZip.Count -eq 0) {
        throw "Aucun fichier/dossier trouvé pour le zip."
    }

    Write-Info "Contenu du zip :"
    foreach ($entry in $FilesToZip) {
        Write-Host " - $entry"
    }

    Compress-Archive -Path $FilesToZip -DestinationPath $ZipPath -Force

    if (-not (Test-Path $ZipPath)) {
        throw "Le zip n'a pas été créé."
    }

    $ZipInfo = Get-Item $ZipPath
    $ZipSizeMB = [Math]::Round($ZipInfo.Length / 1MB, 2)

    Write-Ok "Zip créé : $($ZipInfo.FullName)"
    Write-Ok "Taille zip : $ZipSizeMB MB"

    # Mise à jour manifest avec infos zip
    $Manifest.zip_size_bytes = $ZipInfo.Length
    $Manifest.zip_size_mb = $ZipSizeMB
    $ManifestJson = $Manifest | ConvertTo-Json -Depth 10
    Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8
    Set-Content -Path $ManifestArchivePath -Value $ManifestJson -Encoding UTF8

    Write-Step "UPLOAD DU ZIP"

    scp -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o IPQoS=throughput `
        $ZipPath `
        "${Remote}:${RemotePath}/"

    Require-Success $LASTEXITCODE "Upload SCP échoué."

    Write-Ok "Upload terminé."

    Write-Step "DEPLOIEMENT COTE SERVEUR"

    $RemoteScriptPathLocal = Join-Path $ProjectPath "deploy-remote.sh"
    $RemoteScriptPathServer = "$RemotePath/deploy-remote.sh"

    if (Test-Path $RemoteScriptPathLocal) {
        Remove-Item -Force $RemoteScriptPathLocal
    }

    $RemoteScript = @"
#!/bin/bash
set -e

cd "$RemotePath"

echo "== Déploiement serveur =="
date
pwd

mkdir -p "_backup"
mkdir -p "_deploy/manifests"

BACKUP_FILE="_backup/deploy_backup_$Timestamp.tar.gz"

echo "== Sauvegarde serveur =="
tar \
  --exclude='./node_modules' \
  --exclude='./_backup' \
  --exclude='./_deploy' \
  --exclude='./$ZipName' \
  --exclude='./deploy-remote.sh' \
  -czf "\$BACKUP_FILE" \
  . 2>/dev/null || true

echo "Sauvegarde créée : \$BACKUP_FILE"

echo "== Décompression zip =="
unzip -o "$ZipName"

echo "== Suppression zip =="
rm -f "$ZipName"
"@

    if (-not $SkipRemoteNpmCi) {
        $RemoteScript += @"

echo "== npm ci côté serveur =="
npm ci
"@
    }
    else {
        $RemoteScript += @"

echo "== npm ci côté serveur ignoré =="
"@
    }

    $RemoteScript += @"

echo "== Vérification BUILD_ID =="
if [ -f ".next/BUILD_ID" ]; then
  echo "BUILD_ID serveur :"
  cat ".next/BUILD_ID"
  ls -la ".next/BUILD_ID"
else
  echo "ERREUR: .next/BUILD_ID absent"
  exit 1
fi

echo "== Archivage manifest =="
if [ -f "deploy-manifest.json" ]; then
  cp -f "deploy-manifest.json" "_deploy/manifests/deploy_manifest_$Timestamp.json"
  cp -f "deploy-manifest.json" "_deploy/deploy_manifest_latest.json"
fi

echo "== Nettoyage anciennes sauvegardes =="
ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | tail -n +$($RemoteBackupKeep + 1) | xargs -r rm -f

echo "== Déploiement serveur terminé =="
"@

    # Ecrire le script shell en UTF-8 sans BOM + fins de ligne Unix (LF)
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $RemoteScriptUnix = $RemoteScript -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($RemoteScriptPathLocal, $RemoteScriptUnix, $Utf8NoBom)

    Write-Info "Upload du script distant..."
    scp -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o IPQoS=throughput `
        $RemoteScriptPathLocal `
        "${Remote}:${RemoteScriptPathServer}"

    Require-Success $LASTEXITCODE "Upload du script distant échoué."

    Write-Info "Exécution du script distant..."
    ssh $Remote "cd '$RemotePath' && chmod +x './deploy-remote.sh' && /bin/bash './deploy-remote.sh'; rc=`$?; rm -f './deploy-remote.sh'; exit `$rc"

    Require-Success $LASTEXITCODE "Le déploiement SSH a échoué."

    if (Test-Path $RemoteScriptPathLocal) {
        Remove-Item -Force $RemoteScriptPathLocal
    }

    Write-Step "RESUME"

    Write-Ok "Déploiement terminé avec succès."
    Write-Host "Site               : artmuse.ch" -ForegroundColor Green
    Write-Host "Branche            : $CurrentBranch" -ForegroundColor Green
    Write-Host "Commit             : $CurrentCommit" -ForegroundColor Green
    Write-Host "Tag sauvegarde Git : $GitTag" -ForegroundColor Green
    Write-Host "BUILD_ID           : $LocalBuildId" -ForegroundColor Green
    Write-Host "Zip                : $ZipName" -ForegroundColor Green
    Write-Host "Manifest           : $ManifestArchivePath" -ForegroundColor Green
    Write-Host "Log                : $LogFile" -ForegroundColor Green

    Write-Host ""
    Write-Host "Action éventuelle restante :" -ForegroundColor Cyan
    Write-Host "Relancer l'application depuis le manager Infomaniak si nécessaire." -ForegroundColor Cyan
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "ECHEC DU DEPLOIEMENT" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Consulte le log : $LogFile" -ForegroundColor Yellow
    throw
}
finally {
    Stop-Transcript | Out-Null
}
