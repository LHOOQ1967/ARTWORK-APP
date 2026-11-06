param(
    [switch]$Execute,
    [string]$BackupDirectory = '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde\supabase-database-20261027-152334-3efc4667',
    [string]$IntegrityReportDirectory = '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde\integrity-restore-test-20261029-103756-7cbbedb8',
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
$prior = Get-Content -LiteralPath (Join-Path $IntegrityReportDirectory 'result.json') -Raw | ConvertFrom-Json
if ($prior.internalIntegrityTestPassed -ne $true -or $prior.targetProject -ne 'sontvcvvtftvivysiccg' -or
    $prior.sourceSHA256 -ne $manifest.sha256) {
    throw 'A passing internal-integrity report for this archive and test project is required.'
}
$dataReport = Get-Content -LiteralPath (Join-Path $TableDataReportDirectory 'result.json') -Raw | ConvertFrom-Json
if ($dataReport.tableDataTestPassed -ne $true -or $dataReport.targetProject -ne $prior.targetProject -or
    $dataReport.sourceSHA256 -ne $manifest.sha256) { throw 'Matching table-data report required.' }
$expected = Get-Content -LiteralPath (Join-Path $TableDataReportDirectory 'expected-counts.json') -Raw | ConvertFrom-Json
if (@($expected.PSObject.Properties).Count -ne 39) { throw 'Expected exactly 39 archived table counts.' }
$rowChecks = @()
foreach ($property in ($expected.PSObject.Properties | Sort-Object Name)) {
    if ($property.Name -notmatch '^[a-z_][a-z_0-9]*$' -or $property.Value -isnot [ValueType] -or
        $property.Value -lt 0 -or [decimal]$property.Value -ne [math]::Truncate([decimal]$property.Value)) {
        throw 'Invalid expected table count.'
    }
    $rowChecks += "DO `$check`$ BEGIN IF (SELECT count(*) FROM public.$($property.Name)) <> $($property.Value) THEN RAISE EXCEPTION 'Row count mismatch: $($property.Name)'; END IF; END; `$check`$;"
}
$helpers = @(
    'can_access_artwork_comment_client(uuid, uuid)', 'can_access_artwork_document(uuid, text, uuid)',
    'can_view_artwork(uuid)', 'current_profile_role()', 'has_contact_access(uuid)',
    'is_admin()', 'is_admin_or_editor()', 'user_has_any_access()'
)
$directory = Join-Path (Split-Path $BackupDirectory -Parent) ('access-restore-test-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $directory | Out-Null
$list = & $restore --list $archive
if ($LASTEXITCODE -ne 0) { throw 'Cannot read archive index.' }
$selected = @($list | Where-Object {
    $_ -match '^\d+; \d+ \d+ SCHEMA - security ' -or
    $_ -match '^\d+; \d+ \d+ (ROW SECURITY|POLICY) public ' -or
    ($_ -match '^\d+; \d+ \d+ FUNCTION security (.+) postgres$' -and $helpers -contains $Matches[1])
})
if ($selected.Count -ne 163 -or @($selected | Where-Object { $_ -match ' FUNCTION security ' }).Count -ne 8 -or
    @($selected | Where-Object { $_ -match ' POLICY public ' }).Count -ne 115 -or
    @($selected | Where-Object { $_ -match ' ROW SECURITY public ' }).Count -ne 39 -or
    @($selected | Where-Object { $_ -match ' SCHEMA - security ' }).Count -ne 1) {
    throw 'Unexpected access object selection; stop for review.'
}
$listPath = Join-Path $directory 'selected-objects.list'
$selected | Set-Content -LiteralPath $listPath -Encoding ASCII
$sqlPath = Join-Path $directory 'access-restore.sql'
& $restore --no-owner --no-acl "--use-list=$listPath" "--file=$sqlPath" $archive
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare access restore SQL.' }
$sql = [System.IO.File]::ReadAllText($sqlPath)
$sql = $sql.Replace('SET statement_timeout = 0;', "SET LOCAL statement_timeout = '10min';")
$sql = $sql.Replace('SET lock_timeout = 0;', "SET LOCAL lock_timeout = '5s';")
$sql += "`nREVOKE ALL ON SCHEMA security FROM PUBLIC, anon, authenticated;`nREVOKE ALL ON ALL FUNCTIONS IN SCHEMA security FROM PUBLIC, anon, authenticated;`n"
[System.IO.File]::WriteAllText($sqlPath, $sql, (New-Object System.Text.UTF8Encoding($false)))

$guardPath = Join-Path $directory 'guard.sql'
$guard = @'
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected restore identity';
  END IF;
  IF to_regnamespace('security') IS NOT NULL THEN
    RAISE EXCEPTION 'Target security schema already exists; no overwrite or rerun allowed';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 39 OR
     (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public' AND c.contype = 'f' AND c.convalidated) <> 67 THEN
    RAISE EXCEPTION 'Expected the previously validated tables and internal foreign keys';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public') OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'Public access rules already exist; stop for review'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users' AND t.tgname = 'on_auth_user_created'
  ) THEN RAISE EXCEPTION 'Unexpected application trigger'; END IF;
END;
$guard$;
'@
@($guard) + $rowChecks | Set-Content -LiteralPath $guardPath -Encoding UTF8
$probesPath = Join-Path $directory 'access-probes.sql'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'test-restore-access.sql') -Destination $probesPath
$checksPath = Join-Path $directory 'validate.sql'
$checks = @($rowChecks)
foreach ($helper in $helpers) {
    $checks += "DO `$check`$ BEGIN IF to_regprocedure('security.$helper') IS NULL THEN RAISE EXCEPTION 'Missing restored helper'; END IF; END; `$check`$;"
}
foreach ($entry in $selected) {
    if ($entry -match ' POLICY public ') {
        if ($entry -notmatch '^\d+; \d+ \d+ POLICY public ([a-z_][a-z_0-9]*) (.+) postgres$') {
            throw 'Unexpected archived policy entry; cannot validate its full name.'
        }
        $table = $Matches[1]
        $policy = $Matches[2].Replace("'", "''")
        $checks += "DO `$check`$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = '$table' AND policyname = '$policy') THEN RAISE EXCEPTION 'Missing archived policy on table $table'; END IF; END; `$check`$;"
    }
}
$checks += @'
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SCHEMA security FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA security FROM PUBLIC, anon, authenticated;
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') <> 115 OR
     (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) <> 39 THEN
    RAISE EXCEPTION 'Incomplete RLS restoration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) roles(name)
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND has_table_privilege(roles.name::name, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) roles(name)
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(roles.name::name, c.oid, a.attnum, 'SELECT,INSERT,UPDATE,REFERENCES')
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) roles(name)
    WHERE n.nspname = 'security' AND has_function_privilege(roles.name::name, p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'Temporary probe privileges remain'; END IF;
END;
$check$;
SELECT 'ACCESS_SAMPLE_TEST_PASSED: 16 exact read sets and 8 update probes; full permissions and real login NOT tested' AS result;
'@
$checks | Set-Content -LiteralPath $checksPath -Encoding UTF8
$report = [ordered]@{
    targetProject = 'sontvcvvtftvivysiccg'; sourceSHA256 = $manifest.sha256
    executed = $false; accessSampleTestPassed = $false; fullRestoreTested = $false
    restoredHelpers = 8; restoredPolicies = 115; rlsTables = 39
    plannedReadSetChecks = 16; plannedUpdateChecks = 8
    scope = 'Four simulated identities; artworks, proposals, contact links and documents only. No real Auth login, Storage policies or full authorization validation.'
}
$reportPath = Join-Path $directory 'result.json'
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host "Prepared private access files: $directory"
Write-Host 'Scope: 8 helpers, 115 policies, RLS on 39 tables; 16 exact read sets and 8 update probes.'
Write-Host 'Temporary fixture profiles, contact link and grants are rolled back; no real Auth users or outbound automation.'
if (-not $Execute) {
    Write-Host 'PREPARED ONLY: no database connection. Run with -Execute to test the isolated project.'
    return
}
$connection = 'host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.sontvcvvtftvivysiccg sslmode=require connect_timeout=20 application_name=artmuse_access_test'
Write-Host 'Target: artmuse-restore-test (sontvcvvtftvivysiccg). Enter ONLY its test password.'
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & $psql "--dbname=$connection" --password --no-psqlrc --pset=pager=off --set=ON_ERROR_STOP=1 --single-transaction "--file=$guardPath" "--file=$sqlPath" "--file=$probesPath" "--file=$checksPath" 1> (Join-Path $directory 'restore.log') 2> (Join-Path $directory 'restore-errors.log')
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousPreference
}
$report.executed = $true
$report.accessSampleTestPassed = ($code -eq 0)
$report.finishedAt = [DateTime]::UtcNow.ToString('o')
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
if ($code -ne 0) { throw "Access test failed (exit $code). Transaction was not committed. Inspect private restore-errors.log." }
Write-Host 'PASSED: 16 read sets and 8 update probes matched; fixture data and temporary grants removed. Full authorization and real login remain untested.'
