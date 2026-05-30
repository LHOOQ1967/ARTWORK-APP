
[CmdletBinding()]
param(
    [switch]$AllowDirty,
    [switch]$SkipLocalNpmCi,
    [switch]$SkipRemoteNpmCi,
    [switch]$SkipGitPush,
    [switch]$SkipTagPush,
    [switch]$SkipBranchPush,
    [switch]$SkipLocalBuild
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
$ProjectPath = "C:\Users\philippe\ARTWORK-APP"
$RemotePath  = "/srv/customer/sites/artmuse.ch"

$SshUser = "MbGYYMaq5xi_philippe"
$SshHost = "57-111324.ssh.hosting-ik.com"
$Remote  = "$SshUser@${SshHost}"

$ZipBaseName = "app1"
$RemoteBackupKeep = 7
$GitTagPrefix = "deploy-backup"
$AllowedBranch = "main"

# Fichiers/dossiers à inclure dans le zip
# IMPORTANT :
# - on exclut volontairement .next
# - on n'inclut pas .env.production pour préserver celui du serveur
$IncludePaths = @(
    "app",
    "components",
    "contexts",
    "lib",
    "public",
    "server.js",
    "page.tsx",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "next.config.js",
    "next-env.d.ts",
    "tsconfig.json",
    "postcss.config.js",
    "postcss.config.mjs",
    "eslint.config.js",
    "eslint.config.mjs",
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
$ZipName = "${ZipBaseName}_$Timestamp.zip"
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

    Write-Step "VALIDATION LOCALE"

    if (-not $SkipLocalNpmCi) {
        Write-Info "npm ci local..."
        npm ci
        Require-Success $LASTEXITCODE "npm ci local a échoué."
    }
    else {
        Write-Warn "npm ci local ignoré (-SkipLocalNpmCi)."
    }

    $LocalBuildId = "build-on-server"

    if (-not $SkipLocalBuild) {
        Write-Info "Suppression de .next local..."
        if (Test-Path ".next") {
            Remove-Item -Recurse -Force ".next"
        }

        Write-Info "Build production local (validation syntaxique)..."
        cmd /c "set NODE_ENV=production&& npm run build"
        Require-Success $LASTEXITCODE "Le build production local a échoué."

        if (Test-Path ".next\BUILD_ID") {
            $LocalBuildId = (Get-Content ".next\BUILD_ID" -ErrorAction Stop | Select-Object -First 1).Trim()
            Write-Ok "BUILD_ID local : $LocalBuildId"
        }
        else {
            Write-Warn "'.next\BUILD_ID' absent localement malgré le build. Le build serveur fera foi."
            $LocalBuildId = "build-on-server"
        }
    }
    else {
        Write-Warn "Build local ignoré (-SkipLocalBuild)."
    }

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
        skip_local_build   = [bool]$SkipLocalBuild
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

    $tarCmd = Get-Command tar -ErrorAction SilentlyContinue
    if (-not $tarCmd) {
        throw "La commande 'tar' est introuvable sur cette machine Windows. Installe/active bsdtar ou adapte la création du ZIP."
    }

    $TempZipDir = Join-Path $ProjectPath "__zip_temp"
    if (Test-Path $TempZipDir) {
        Remove-Item -Recurse -Force $TempZipDir
    }
    New-Item -ItemType Directory -Path $TempZipDir | Out-Null

    foreach ($item in $FilesToZip) {
        Copy-Item -Recurse -Force $item $TempZipDir
    }

    Push-Location $TempZipDir
    try {
        tar -a -c -f $ZipPath *
        Require-Success $LASTEXITCODE "La création du ZIP via tar a échoué."
    }
    finally {
        Pop-Location
    }

    Remove-Item -Recurse -Force $TempZipDir

    Add-Type -AssemblyName System.IO.Compression.FileSystem

    try {
        $zipRead = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
        $entryCount = $zipRead.Entries.Count
        $sampleEntries = $zipRead.Entries | Select-Object -First 10 -ExpandProperty FullName
        $zipRead.Dispose()

        if ($entryCount -eq 0) {
            throw "Le ZIP est vide."
        }

        Write-Ok "ZIP validé localement : $entryCount entrée(s)."
        Write-Info "Exemples d'entrées dans le ZIP :"
        foreach ($entry in $sampleEntries) {
            Write-Host " - $entry"
        }
    }
    catch {
        throw "Le ZIP local est invalide : $($_.Exception.Message)"
    }

    if (-not (Test-Path $ZipPath)) {
        throw "Le ZIP n'a pas été créé."
    }

    $ZipInfo = Get-Item $ZipPath
    $ZipSizeMB = [Math]::Round($ZipInfo.Length / 1MB, 2)

    Write-Ok "Zip créé : $($ZipInfo.FullName)"
    Write-Ok "Taille zip : $ZipSizeMB MB"

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
    $KeepPlusOne = $RemoteBackupKeep + 1

    if (Test-Path $RemoteScriptPathLocal) {
        Remove-Item -Force $RemoteScriptPathLocal
    }

    $RemoteNpmBlock = if (-not $SkipRemoteNpmCi) {
@'
echo "== npm ci dans la release =="
npm ci
'@
    }
    else {
@'
echo "== npm ci serveur ignoré =="
if [ -d "../node_modules" ]; then
  cp -a ../node_modules ./node_modules
else
  echo "WARNING: node_modules absent dans l'instance courante ; impossible de skip npm ci"
  exit 1
fi
'@
    }

    $RemoteScriptTemplate = @'
#!/bin/bash
set -euo pipefail

cd "__REMOTE_PATH__"

echo "== Deployment server =="
date
pwd
whoami || true

mkdir -p "_backup"
mkdir -p "_deploy/manifests"
mkdir -p "_deploy/releases"

BACKUP_FILE="_backup/deploy_backup___TIMESTAMP__.tar.gz"
RELEASE_DIR="_deploy/releases/release___TIMESTAMP__"

echo "== Server backup =="
tar -czf "$BACKUP_FILE" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./_backup' \
  --exclude='./_deploy' \
  --exclude='./__ZIP_NAME__' \
  --exclude='./deploy-remote.sh' . || echo "WARNING: backup skipped"

echo "== Inspect zip =="
ls -lah "__ZIP_NAME__" || true
unzip -t "__ZIP_NAME__"
ZIP_TEST_RC=$?
if [ "$ZIP_TEST_RC" -ne 0 ]; then
  echo "ERROR: zip integrity test failed with code $ZIP_TEST_RC"
  exit "$ZIP_TEST_RC"
fi

echo "== Prepare release dir =="
rm -rf "$RELEASE_DIR" 2>/dev/null || true
mkdir -p "$RELEASE_DIR"

echo "== Unzip into release dir =="
unzip -oq "__ZIP_NAME__" -d "$RELEASE_DIR"
UNZIP_RC=$?
if [ "$UNZIP_RC" -ne 0 ]; then
  echo "ERROR: unzip failed with code $UNZIP_RC"
  exit "$UNZIP_RC"
fi

echo "== Copy env if present =="
if [ -f ".env.production" ]; then
  cp -f ".env.production" "$RELEASE_DIR/.env.production"
fi

echo "== Build release =="
cd "$RELEASE_DIR"

__REMOTE_NPM_BLOCK__

echo "== Build on server =="
NODE_ENV=production npm run build

echo "== Check BUILD_ID =="
if [ -f ".next/BUILD_ID" ]; then
  echo "Server BUILD_ID:"
  cat ".next/BUILD_ID"
  ls -la ".next/BUILD_ID"
else
  echo "ERROR: .next/BUILD_ID missing"
  exit 1
fi

cd "__REMOTE_PATH__"

echo "== Promote release =="
for item in app components contexts lib public server.js page.tsx package.json package-lock.json next.config.ts next.config.js next-env.d.ts tsconfig.json postcss.config.js postcss.config.mjs eslint.config.js eslint.config.mjs README.md AGENTS deploy-manifest.json .next node_modules; do
  rm -rf "./$item" 2>/dev/null || true
done

cp -a "$RELEASE_DIR"/. .

echo "== Archive manifest =="
if [ -f "deploy-manifest.json" ]; then
  cp -f "deploy-manifest.json" "_deploy/manifests/deploy_manifest___TIMESTAMP__.json"
  cp -f "deploy-manifest.json" "_deploy/deploy_manifest_latest.json"
fi

echo "== Cleanup temp files =="
rm -rf "$RELEASE_DIR" 2>/dev/null || true
rm -f "__ZIP_NAME__" 2>/dev/null || true
rm -f "deploy-remote.sh" 2>/dev/null || true

echo "== Cleanup old backups =="
ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | tail -n +__KEEP_PLUS_ONE__ | xargs -r rm -f || true

echo "== Server deployment finished =="
'@

    $RemoteScript = $RemoteScriptTemplate
    $RemoteScript = $RemoteScript.Replace("__REMOTE_PATH__", $RemotePath)
    $RemoteScript = $RemoteScript.Replace("__TIMESTAMP__", $Timestamp)
    $RemoteScript = $RemoteScript.Replace("__ZIP_NAME__", $ZipName)
    $RemoteScript = $RemoteScript.Replace("__KEEP_PLUS_ONE__", [string]$KeepPlusOne)
    $RemoteScript = $RemoteScript.Replace("__REMOTE_NPM_BLOCK__", $RemoteNpmBlock)

    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $RemoteScriptUnix = $RemoteScript -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($RemoteScriptPathLocal, $RemoteScriptUnix, $Utf8NoBom)

    Write-Info "Upload du script distant..."
    scp -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o IPQoS=throughput `
        $RemoteScriptPathLocal `
        "${Remote}:${RemoteScriptPathServer}"
    Require-Success $LASTEXITCODE "Upload du script distant échoué."


Write-Info "Exécution du script distant..."
$RemoteExecCmd = "cd $RemotePath && chmod +x $RemoteScriptPathServer && /bin/bash $RemoteScriptPathServer"
ssh $Remote $RemoteExecCmd
$RemoteExecExit = $LASTEXITCODE

Write-Info "Nettoyage du script distant..."
ssh $Remote "rm -f $RemoteScriptPathServer" | Out-Null

Require-Success $RemoteExecExit "Le déploiement SSH a échoué."

if (Test-Path $RemoteScriptPathLocal) {
    Remove-Item -Force $RemoteScriptPathLocal
}


    Write-Step "RESUME"

    Write-Ok "Déploiement terminé avec succès."
    Write-Host "Site               : artmuse.ch" -ForegroundColor Green
    Write-Host "Branche            : $CurrentBranch" -ForegroundColor Green
    Write-Host "Commit             : $CurrentCommit" -ForegroundColor Green
    Write-Host "Tag sauvegarde Git : $GitTag" -ForegroundColor Green
    Write-Host "BUILD_ID local     : $LocalBuildId" -ForegroundColor Green
    Write-Host "Zip                : $ZipName" -ForegroundColor Green
    Write-Host "Manifest           : $ManifestArchivePath" -ForegroundColor Green
    Write-Host "Log                : $LogFile" -ForegroundColor Green

    Write-Host ""
    Write-Host "Action éventuelle restante :" -ForegroundColor Cyan
    Write-Host "Relancer l'application depuis le manager Infomaniak si nécessaire." -ForegroundColor Cyan
    Write-Host "Manager Infomaniak : [ouvrir le dashboard](https://manager.infomaniak.com/v3/hosting/136787/hosting/785241/h3/111324/nodejs/51142/data/dashboard)" -ForegroundColor Cyan
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
