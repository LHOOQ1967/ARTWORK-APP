#!/bin/bash
set -euo pipefail

cd "/srv/customer/sites/artmuse.ch"

echo "== Deployment server =="
date
pwd
whoami || true

mkdir -p "_backup"
mkdir -p "_deploy/manifests"
mkdir -p "_deploy/releases"

BACKUP_FILE="_backup/deploy_backup_20260530_092946.tar.gz"
RELEASE_DIR="_deploy/releases/release_20260530_092946"

echo "== Server backup =="
tar -czf "$BACKUP_FILE" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./_backup' \
  --exclude='./_deploy' \
  --exclude='./app1_20260530_092946.zip' \
  --exclude='./deploy-remote.sh' . || echo "WARNING: backup skipped"

echo "== Inspect zip =="
ls -lah "app1_20260530_092946.zip" || true
unzip -t "app1_20260530_092946.zip"
ZIP_TEST_RC=$?
if [ "$ZIP_TEST_RC" -ne 0 ]; then
  echo "ERROR: zip integrity test failed with code $ZIP_TEST_RC"
  exit "$ZIP_TEST_RC"
fi

echo "== Prepare release dir =="
rm -rf "$RELEASE_DIR" 2>/dev/null || true
mkdir -p "$RELEASE_DIR"

echo "== Unzip into release dir =="
unzip -oq "app1_20260530_092946.zip" -d "$RELEASE_DIR"
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

echo "== npm ci dans la release =="
npm ci

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

cd "/srv/customer/sites/artmuse.ch"

echo "== Promote release =="
for item in app components contexts lib public server.js page.tsx package.json package-lock.json next.config.ts next.config.js next-env.d.ts tsconfig.json postcss.config.js postcss.config.mjs eslint.config.js eslint.config.mjs README.md AGENTS deploy-manifest.json .next node_modules; do
  rm -rf "./$item" 2>/dev/null || true
done

cp -a "$RELEASE_DIR"/. .

echo "== Archive manifest =="
if [ -f "deploy-manifest.json" ]; then
  cp -f "deploy-manifest.json" "_deploy/manifests/deploy_manifest_20260530_092946.json"
  cp -f "deploy-manifest.json" "_deploy/deploy_manifest_latest.json"
fi

echo "== Cleanup temp files =="
rm -rf "$RELEASE_DIR" 2>/dev/null || true
rm -f "app1_20260530_092946.zip" 2>/dev/null || true
rm -f "deploy-remote.sh" 2>/dev/null || true

echo "== Cleanup old backups =="
ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f || true

echo "== Server deployment finished =="