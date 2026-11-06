param(
    [switch]$Execute,
    [string]$BackupDirectory = '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde\supabase-database-20261027-152334-3efc4667',
    [string]$TableDataReportDirectory = '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde\restore-test-20261029-102814-d7c5a021',
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$restore = Join-Path $PostgresBin 'pg_restore.exe'
$psql = Join-Path $PostgresBin 'psql.exe'
foreach ($tool in @($restore, $psql)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Missing tool: $tool" }
}
$archive = Join-Path $BackupDirectory 'database.dump'
$manifest = Get-Content -LiteralPath (Join-Path $BackupDirectory 'manifest.json') -Raw | ConvertFrom-Json
if (-not $manifest.complete -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) {
    throw 'The source archive is incomplete or its checksum differs.'
}
$prior = Get-Content -LiteralPath (Join-Path $TableDataReportDirectory 'result.json') -Raw | ConvertFrom-Json
if ($prior.tableDataTestPassed -ne $true -or $prior.checkedTables -ne 39 -or
    $prior.targetProject -ne 'sontvcvvtftvivysiccg' -or $prior.sourceSHA256 -ne $manifest.sha256) {
    throw 'A passing 39-table data report for this archive and test project is required.'
}
$expected = Get-Content -LiteralPath (Join-Path $TableDataReportDirectory 'expected-counts.json') -Raw | ConvertFrom-Json
if (@($expected.PSObject.Properties).Count -ne 39) { throw 'Expected exactly 39 archived table counts.' }
foreach ($property in $expected.PSObject.Properties) {
    if ($property.Name -notmatch '^[a-z_][a-z_0-9]*$' -or
        $property.Value -isnot [ValueType] -or $property.Value -lt 0 -or
        [decimal]$property.Value -ne [math]::Truncate([decimal]$property.Value)) {
        throw 'Invalid expected table count.'
    }
}

$directory = Join-Path (Split-Path $BackupDirectory -Parent) ('integrity-restore-test-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $directory | Out-Null
$list = & $restore --list $archive
if ($LASTEXITCODE -ne 0) { throw 'Cannot read archive index.' }
$entries = @($list | Where-Object { $_ -match '^\d+; \d+ \d+ (CONSTRAINT|FK CONSTRAINT|INDEX) public ' })
$listPath = Join-Path $directory 'selected-objects.list'
$entries | Set-Content -LiteralPath $listPath -Encoding ASCII
$sqlPath = Join-Path $directory 'integrity-restore.sql'
& $restore --no-owner --no-acl "--use-list=$listPath" "--file=$sqlPath" $archive
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare structure SQL.' }
$sql = [System.IO.File]::ReadAllText($sqlPath)
$foreignKeys = [regex]::Matches($sql, 'ALTER TABLE ONLY public\.([a-z_][a-z_0-9]*)\s+ADD CONSTRAINT ([a-z_][a-z_0-9]*) FOREIGN KEY[\s\S]*?;')
$deferred = @()
$internalCount = 0
foreach ($fk in $foreignKeys) {
    if ($fk.Value -match 'REFERENCES auth\.users\(id\)') {
        $deferred += [pscustomobject]@{ table = $fk.Groups[1].Value; constraint = $fk.Groups[2].Value; reason = 'Auth users not restored' }
        $sql = $sql.Replace($fk.Value, '')
    } elseif ($fk.Value -match 'REFERENCES public\.[a-z_][a-z_0-9]*\(') {
        $internalCount++
    } else {
        throw 'Unexpected foreign-key dependency; review the archive.'
    }
}
$constraints = @($entries | Where-Object { $_ -match ' CONSTRAINT public ' -and $_ -notmatch ' FK CONSTRAINT public ' })
$indexes = @($entries | Where-Object { $_ -match ' INDEX public ' })
if ($constraints.Count -ne 47 -or $indexes.Count -ne 84 -or $foreignKeys.Count -ne 74 -or
    $internalCount -ne 67 -or $deferred.Count -ne 7) {
    throw 'Unexpected structure counts; review the archive before execution.'
}
$deferred | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'deferred-auth-relations.json') -Encoding UTF8
$selected = @($entries | Where-Object {
    $entry = $_
    -not @($deferred | Where-Object { $entry -match (' FK CONSTRAINT public ' + [regex]::Escape($_.table + ' ' + $_.constraint) + ' ') }).Count
})
$selected | Set-Content -LiteralPath $listPath -Encoding ASCII
# Keep the dump's other session settings but do not let its header disable timeouts.
$sql = $sql.Replace('SET statement_timeout = 0;', "SET LOCAL statement_timeout = '10min';")
$sql = $sql.Replace('SET lock_timeout = 0;', "SET LOCAL lock_timeout = '5s';")
[System.IO.File]::WriteAllText($sqlPath, $sql, (New-Object System.Text.UTF8Encoding($false)))

$rowChecks = @()
foreach ($property in ($expected.PSObject.Properties | Sort-Object Name)) {
    $rowChecks += "DO `$check`$ BEGIN IF (SELECT count(*) FROM public.$($property.Name)) <> $($property.Value) THEN RAISE EXCEPTION 'Row count mismatch: $($property.Name)'; END IF; END; `$check`$;"
}
$guardPath = Join-Path $directory 'guard.sql'
$guard = @'
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected restore identity';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 39 THEN
    RAISE EXCEPTION 'Expected the previously restored 39 public tables';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype IN ('p', 'u', 'f')
  ) THEN RAISE EXCEPTION 'Target already has indexes or key constraints; no overwrite or rerun allowed'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION 'Unexpected application trigger'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname <> 'public'
  ) THEN RAISE EXCEPTION 'pg_trgm is not in archived schema public; review before proceeding'; END IF;
END;
$guard$;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
'@
@($guard) + $rowChecks | Set-Content -LiteralPath $guardPath -Encoding UTF8

$checksPath = Join-Path $directory 'validate.sql'
$checks = @($rowChecks)
foreach ($entry in $selected) {
    if ($entry -match '^\d+; \d+ \d+ (?:FK )?CONSTRAINT public ([a-z_][a-z_0-9]*) ([a-z_][a-z_0-9]*) ') {
        $table = $Matches[1]
        $name = $Matches[2]
        $checks += "DO `$check`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.$table'::regclass AND conname = '$name' AND convalidated) THEN RAISE EXCEPTION 'Missing or unvalidated constraint: $name'; END IF; END; `$check`$;"
    } elseif ($entry -match '^\d+; \d+ \d+ INDEX public ([a-z_][a-z_0-9]*) ') {
        $name = $Matches[1]
        $checks += "DO `$check`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.$name') AND indisvalid AND indisready) THEN RAISE EXCEPTION 'Missing or invalid index: $name'; END IF; END; `$check`$;"
    } else {
        throw 'Unexpected selected archive entry.'
    }
}
$checks += @'
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype IN ('p','u')) <> 47 OR
     (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'f' AND c.convalidated) <> 67 THEN
    RAISE EXCEPTION 'Unexpected final constraint counts';
  END IF;
  IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND i.indisvalid AND i.indisready) <> 131 THEN
    RAISE EXCEPTION 'Expected 84 standalone indexes plus 47 constraint indexes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION 'Unexpected application trigger'; END IF;
END;
$check$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
SELECT 'INTERNAL_INTEGRITY_TEST_PASSED: Auth relations and application behavior NOT tested' AS result;
'@
$checks | Set-Content -LiteralPath $checksPath -Encoding UTF8
$report = [ordered]@{
    targetProject = 'sontvcvvtftvivysiccg'; sourceSHA256 = $manifest.sha256
    executed = $false; internalIntegrityTestPassed = $false; fullRestoreTested = $false
    plannedKeyConstraints = 47; plannedStandaloneIndexes = 84
    plannedInternalForeignKeys = 67; deferredAuthForeignKeys = 7
    scope = 'Internal structure and archived row counts only; no Auth, RLS or application validation'
}
$reportPath = Join-Path $directory 'result.json'
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host "Prepared private integrity files: $directory"
Write-Host 'Scope: 47 key constraints, 84 indexes, 67 internal foreign keys; 7 Auth relations deferred.'
if (-not $Execute) {
    Write-Host 'PREPARED ONLY: no database connection. Run with -Execute to test the isolated project.'
    return
}
$connection = 'host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.sontvcvvtftvivysiccg sslmode=require connect_timeout=20 application_name=artmuse_integrity_test'
Write-Host 'Target: artmuse-restore-test (sontvcvvtftvivysiccg). Enter ONLY its test password.'
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & $psql "--dbname=$connection" --password --no-psqlrc --pset=pager=off --set=ON_ERROR_STOP=1 --single-transaction "--file=$guardPath" "--file=$sqlPath" "--file=$checksPath" 1> (Join-Path $directory 'restore.log') 2> (Join-Path $directory 'restore-errors.log')
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousPreference
}
$report.executed = $true
$report.internalIntegrityTestPassed = ($code -eq 0)
$report.finishedAt = [DateTime]::UtcNow.ToString('o')
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
if ($code -ne 0) { throw "Integrity restore failed (exit $code). Transaction was not committed. Inspect private restore-errors.log." }
Write-Host 'PASSED: keys, indexes, 67 internal foreign keys and 39 table row counts validated. Seven Auth relations and full restoration remain untested.'
