
[CmdletBinding()]
param(
    [string]$BackupFile = "",
    [switch]$ListOnly,
    [switch]$SkipRemoteNpmCi
)

$ErrorActionPreference = "Stop"

# =========================
# CONFIG
# =========================
$ProjectPath = "C:\Users\Philippe\artwork-app"
$RemotePath = "/srv/customer/sites/artmuse.ch"

$SshUser = "MbGYYMaq5xi_philippe"
$SshHost = "57-111324.ssh.hosting-ik.com"
$Remote = "$SshUser@${SshHost}"

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

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
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

Set-Location $ProjectPath

Write-Step "ROLLBACK SERVEUR"

if ($ListOnly) {
    $ListScript = @"
set -e
cd "$RemotePath"
echo "Sauvegardes disponibles :"
ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null || true
"@

    $ListScript | ssh $Remote "bash -s"
    Require-Success $LASTEXITCODE "Impossible de lister les sauvegardes serveur."
    exit 0
}

$RemoteScript = @"
set -e
cd "$RemotePath"

if [ ! -d "_backup" ]; then
  echo "ERREUR: dossier _backup introuvable"
  exit 1
fi

if [ -n "$BackupFile" ]; then
  BACKUP_FILE="$BackupFile"
else
  BACKUP_FILE=`$(ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | head -n 1)
fi

if [ -z "`$BACKUP_FILE" ]; then
  echo "ERREUR: aucune sauvegarde trouvée"
  exit 1
fi

if [ ! -f "`$BACKUP_FILE" ]; then
  echo "ERREUR: sauvegarde introuvable -> `$BACKUP_FILE"
  exit 1
fi

echo "Sauvegarde utilisée : `$BACKUP_FILE"

TMP_RESTORE_DIR="_rollback_tmp"
rm -rf "`$TMP_RESTORE_DIR"
mkdir -p "`$TMP_RESTORE_DIR"

echo "== Extraction de la sauvegarde =="
tar -xzf "`$BACKUP_FILE" -C "`$TMP_RESTORE_DIR"

echo "== Nettoyage des fichiers de l'app actuelle =="
"@

    foreach ($item in $RestoreTargets) {
        $escaped = $item.Replace('"', '\"')
        $RemoteScript += "rm -rf ""$escaped""" + "`n"
    }

    $RemoteScript += @"

echo "== Restauration =="
for item in "`$TMP_RESTORE_DIR"/* "`$TMP_RESTORE_DIR"/.*; do
  base=`$(basename "`$item")
  if [ "`$base" != "." ] && [ "`$base" != ".." ]; then
    mv "`$item" .
  fi
done

rm -rf "`$TMP_RESTORE_DIR"

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

$RemoteScript | ssh $Remote "bash -s"
Require-Success $LASTEXITCODE "Le rollback a échoué."

Write-Host ""
Write-Host "Rollback terminé." -ForegroundColor Green
Write-Host "Pense à relancer l'application depuis Infomaniak si nécessaire." -ForegroundColor Cyan
Write-Host ""
