#!/bin/bash
set -euo pipefail

cd "/srv/customer/sites/artmuse.ch"

echo "== Deployment server =="
date
pwd

mkdir -p "_backup"
mkdir -p "_deploy/manifests"

BACKUP_FILE="_backup/deploy_backup_20260530_085118.tar.gz"



echo "== Server backup =="

tar -czf "" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./_backup' \
  --exclude='./_deploy' \
  --exclude='./app1.zip' \
  --exclude='./deploy-remote.sh' . || echo "WARNING: backup skipped"



echo "== Unzip package =="
UNZIP_RC=0
unzip -o "app1.zip" || UNZIP_RC=\True
if [ "\" -gt 1 ]; then
  echo "ERROR: unzip failed with code \"
  exit "\"
fi

echo "== Remove zip =="
rm -f "app1.zip"

echo "== Remove old .next =="
rm -rf ".next"
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
  cp -f "deploy-manifest.json" "_deploy/manifests/deploy_manifest_20260530_085118.json"
  cp -f "deploy-manifest.json" "_deploy/deploy_manifest_latest.json"
fi

echo "== Cleanup old backups =="

ls -1t _backup/deploy_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f


echo "== Server deployment finished =="