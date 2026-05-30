#!/bin/bash
set -euo pipefail

cd "/srv/customer/sites/artmuse.ch"

echo "== Deployment server =="
date
pwd

mkdir -p "_backup"
mkdir -p "_deploy/manifests"

BACKUP_FILE="_backup/deploy_backup_20260530_091740.tar.gz"

echo "== Server backup =="
tar -czf "$BACKUP_FILE" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./_backup' \
  --exclude='./_deploy' \
  --exclude='./app1_20260530_091740.zip' \
  --exclude='./deploy-remote.sh' . || echo "WARNING: backup skipped"


echo "== Inspect zip =="
ls -lah "app1_20260530_091740.zip" || true
unzip -t "app1_20260530_091740.zip"
ZIP_TEST_RC=$?
if [ "$ZIP_TEST_RC" -ne 0 ]; then
  echo "ERROR: zip integrity test failed with code $ZIP_TEST_RC"
  exit "$ZIP_TEST_RC"
fi



echo "== Unzip package into temp dir =="

rm -rf "_deploy_unpack" 2>/dev/null || true
mkdir -p "_deploy_unpack"

unzip -oq "app1_20260530_091740.zip" -d "_deploy_unpack"
UNZIP_RC=$?
if [ "$UNZIP_RC" -ne 0 ]; then
  echo "ERROR: unzip failed with code $UNZIP_RC"
  exit "$UNZIP_RC"
fi

echo "== Copy new files safely =="
cp -R _deploy_unpack/* . 2>/dev/null || true
cp -R _deploy_unpack/.[!.]* . 2>/dev/null || true

echo "== Cleanup temp =="
rm -rf "_deploy_unpack" 2>/dev/null || true

echo "== Remove old .next =="
rm -rf ".next" 2>/dev/null || true


echo "== Copy new files safely =="

cp -R _deploy_unpack/* . 2>/dev/null || true
cp -R _deploy_unpack/.[!.]* . 2>/dev/null || true


echo "== Remove temp files =="
rm -rf "_deploy_unpack"
rm -f "app1_20260530_091740.zip"


echo "== npm ci on server =="
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

echo "== Archive manifest =="
if [ -f "deploy-manifest.json" ]; then
  cp -f "deploy-manifest.json" "_deploy/manifests/deploy_manifest_20260530_091740.json"
  cp -f "deploy-manifest.json" "_deploy/deploy_manifest_latest.json"
fi

echo "== Cleanup old backups =="
ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f || true

echo "== Server deployment finished =="
echo "== npm ci on server =="
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

echo "== Archive manifest =="
if [ -f "deploy-manifest.json" ]; then
  cp -f "deploy-manifest.json" "_deploy/manifests/deploy_manifest_20260530_091740.json"
  cp -f "deploy-manifest.json" "_deploy/deploy_manifest_latest.json"
fi

echo "== Cleanup old backups =="

ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f


echo "== Server deployment finished =="