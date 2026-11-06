param(
    [string]$OutputDirectory = '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde',
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$psql = Join-Path $PostgresBin 'psql.exe'
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) {
    throw "Required PostgreSQL tool not found: $psql"
}
if (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    throw 'The output directory must be an absolute private backup path.'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$path = Join-Path $OutputDirectory ("storage-inventory-$stamp-" + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
$partial = "$path.partial"
$connection = 'host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.cdbtgjhbgswpdehqwjnn sslmode=require connect_timeout=20 application_name=artmuse_inventory'
$query = @'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL client_encoding = 'UTF8';
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SELECT jsonb_build_object(
  'version', 1,
  'source', 'https://cdbtgjhbgswpdehqwjnn.supabase.co',
  'capturedAt', transaction_timestamp(),
  'buckets', (
    SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id)
    FROM storage.buckets b
    WHERE b.id IN ('artwork-images', 'artwork-imports', 'artwork-thumbnails')
  ),
  'files', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'bucket', o.bucket_id,
      'name', o.name,
      'id', o.id,
      'updatedAt', o.updated_at,
      'metadata', o.metadata
    ) ORDER BY o.bucket_id, o.name)
    FROM storage.objects o
    WHERE o.bucket_id IN ('artwork-images', 'artwork-imports', 'artwork-thumbnails')
  ), '[]'::jsonb)
);
COMMIT;
'@

Write-Host 'This reads Storage metadata only. Enter the PostgreSQL password locally; it is not saved.'
& $psql "--dbname=$connection" --password --no-psqlrc --no-align --tuples-only --quiet --set=ON_ERROR_STOP=1 --pset=pager=off --variable=VERBOSITY=terse "--output=$partial" "--command=$query"
if ($LASTEXITCODE -ne 0) {
    throw "Inventory export failed (exit $LASTEXITCODE). Any .partial file is incomplete."
}
$inventory = Get-Content -LiteralPath $partial -Raw -Encoding UTF8 | ConvertFrom-Json
if ($inventory.version -ne 1 -or @($inventory.buckets).Count -ne 3 -or $null -eq $inventory.files) {
    throw 'Inventory validation failed. The partial export must not be used.'
}
Move-Item -LiteralPath $partial -Destination $path
Write-Host "EXPORTED: $path"
Write-Host ("Objects inventoried: " + @($inventory.files).Count)
Write-Host 'This is metadata, NOT a new file backup or proof of a tested restoration.'
