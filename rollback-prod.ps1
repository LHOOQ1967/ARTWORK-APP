
[CmdletBinding()]
param(
    [string]$BackupFile = "",
    [switch]$ListOnly,
    [switch]$SkipRemoteNpmCi
)

$ErrorActionPreference = "Stop"

# =========================
# ENCODAGE CONSOLE
# =========================
try {
    chcp 65001 > $null
} catch {}

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$OutputEncoding = [System.Text.Encoding]::UTF8

# =========================
# CONFIG
# =========================
$ProjectPath = "C:\Users\Philippe\artwork-app"
$RemotePath  = "/srv/customer/sites/artmuse.ch"

$SshUser = "MbGYYMaq5xi_philippe"
$SshHost = "57-111324.ssh.hosting-ik.com"
$Remote  = "$SshUser@${SshHost}"

# Ce que l'on supprime avant restauration
$RestoreTargets = @(
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

# =========================
# DEMARRAGE
# =========================
Set-Location $ProjectPath

$LogsDir = Join-Path $ProjectPath "deploy-logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogsDir "rollback_$Timestamp.log"

Start-Transcript -Path $LogFile -Append | Out-Null

try {
    Write-Step "ROLLBACK SERVEUR"

    if ($ListOnly) {
        Write-Info "Listing des sauvegardes serveur..."

        $RemoteScriptPathLocal = Join-Path $ProjectPath "rollback-list-remote.sh"
        $RemoteScriptPathServer = "$RemotePath/rollback-list-remote.sh"

        if (Test-Path $RemoteScriptPathLocal) {
            Remove-Item -Force $RemoteScriptPathLocal
        }

        $ListScript = @"
#!/bin/bash
set -e

cd "$RemotePath"

echo "Sauvegardes disponibles :"
ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null || true
"@

        $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        $ListScriptUnix = $ListScript -replace "`r`n", "`n"
        [System.IO.File]::WriteAllText($RemoteScriptPathLocal, $ListScriptUnix, $Utf8NoBom)

        Write-Info "Upload du script distant..."
        scp -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o IPQoS=throughput `
            $RemoteScriptPathLocal `
            "${Remote}:${RemoteScriptPathServer}"

        Require-Success $LASTEXITCODE "Impossible d'uploader le script de listing."

        Write-Info "Exécution du script distant..."
        ssh $Remote "cd '$RemotePath' && chmod +x './rollback-list-remote.sh' && /bin/bash './rollback-list-remote.sh'; rc=`$?; rm -f './rollback-list-remote.sh'; exit `$rc"

        Require-Success $LASTEXITCODE "Impossible de lister les sauvegardes serveur."

        if (Test-Path $RemoteScriptPathLocal) {
            Remove-Item -Force $RemoteScriptPathLocal
        }

        Write-Ok "Listing terminé."
        return
    }

    $RemoteScriptPathLocal = Join-Path $ProjectPath "rollback-remote.sh"
    $RemoteScriptPathServer = "$RemotePath/rollback-remote.sh"

    if (Test-Path $RemoteScriptPathLocal) {
        Remove-Item -Force $RemoteScriptPathLocal
    }

    # Génération des commandes rm -rf pour les cibles à restaurer
    $RemoveLines = ""
    foreach ($item in $RestoreTargets) {
        $RemoveLines += "rm -rf '$item'" + "`n"
    }

    $RemoteScript = @"
#!/bin/bash
set -e

cd "$RemotePath"

if [ ! -d "_backup" ]; then
  echo "ERREUR: dossier _backup introuvable"
  exit 1
fi

if [ -n "$BackupFile" ]; then
  BACKUP_FILE="$BackupFile"
else
  BACKUP_FILE=\$(ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | head -n 1)
fi

if [ -z "\$BACKUP_FILE" ]; then
  echo "ERREUR: aucune sauvegarde trouvée"
  exit 1
fi

if [ ! -f "\$BACKUP_FILE" ]; then
  echo "ERREUR: sauvegarde introuvable -> \$BACKUP_FILE"
  exit 1
fi

echo "Sauvegarde utilisée : \$BACKUP_FILE"

TMP_RESTORE_DIR="_rollback_tmp"
rm -rf "\$TMP_RESTORE_DIR"
mkdir -p "\$TMP_RESTORE_DIR"

echo "== Extraction de la sauvegarde =="
tar -xzf "\$BACKUP_FILE" -C "\$TMP_RESTORE_DIR"

echo "== Nettoyage de l'application actuelle =="
$RemoveLines
echo "== Restauration =="
shopt -s dotglob nullglob
mv "\$TMP_RESTORE_DIR"/* .
shopt -u dotglob nullglob

rm -rf "\$TMP_RESTORE_DIR"

"@

    if (-not $SkipRemoteNpmCi) {
        $RemoteScript += @"
echo "== npm ci après rollback =="
npm ci

"@
    }
    else {
        $RemoteScript += @"
echo "== npm ci après rollback ignoré =="

"@
    }

    $RemoteScript += @"
echo "== Vérification BUILD_ID =="
if [ -f ".next/BUILD_ID" ]; then
  echo "BUILD_ID restauré :"
  cat ".next/BUILD_ID"
  ls -la ".next/BUILD_ID"
else
  echo "ATTENTION: .next/BUILD_ID absent après rollback"
fi

echo "== Rollback terminé =="
"@

    # Écriture du script shell en UTF-8 sans BOM + LF Unix
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $RemoteScriptUnix = $RemoteScript -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($RemoteScriptPathLocal, $RemoteScriptUnix, $Utf8NoBom)

    Write-Info "Upload du script distant..."
    scp -o ServerAliveInterval=30 -o ServerAliveCountMax=20 -o IPQoS=throughput `
        $RemoteScriptPathLocal `
        "${Remote}:${RemoteScriptPathServer}"

    Require-Success $LASTEXITCODE "Upload du script de rollback échoué."

    Write-Info "Exécution du rollback distant..."
    ssh $Remote "cd '$RemotePath' && chmod +x './rollback-remote.sh' && /bin/bash './rollback-remote.sh'; rc=`$?; rm -f './rollback-remote.sh'; exit `$rc"

    Require-Success $LASTEXITCODE "Le rollback a échoué."

    if (Test-Path $RemoteScriptPathLocal) {
        Remove-Item -Force $RemoteScriptPathLocal
    }

    Write-Host ""
    Write-Ok "Rollback terminé."
    Write-Host "Pense à relancer l'application depuis Infomaniak si nécessaire." -ForegroundColor Cyan
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "ECHEC DU ROLLBACK" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Consulte le log : $LogFile" -ForegroundColor Yellow
    throw
}
finally {
    Stop-Transcript | Out-Null
}
