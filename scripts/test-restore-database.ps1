param(
    [switch]$Execute,
    [string]$BackupDirectory = '\\SERVEUR\Company\9010 BASES\artmuse\sauvegarde\supabase-database-20261027-152334-3efc4667',
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
$directory = Join-Path (Split-Path $BackupDirectory -Parent) ('restore-test-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $directory | Out-Null
$list = & $restore --list $archive
if ($LASTEXITCODE -ne 0) { throw 'Cannot read archive index.' }
$selected = @($list | Where-Object {
    $_ -match '^\d+; \d+ \d+ (TABLE|TABLE DATA|SEQUENCE|SEQUENCE SET|SEQUENCE OWNED BY) public [a-z_][a-z_0-9]* ' -or
    $_ -match '^\d+; \d+ \d+ FUNCTION public immutable_unaccent\(text\) '
})
if (@($selected | Where-Object { $_ -match ' FUNCTION public immutable_unaccent\(text\) ' }).Count -ne 1) {
    throw 'Expected exactly one archived immutable_unaccent(text) dependency.'
}
$tables = @($selected | ForEach-Object {
    if ($_ -match '^\d+; \d+ \d+ TABLE public ([a-z_][a-z_0-9]*) ') { $Matches[1] }
})
if ($tables.Count -ne 39) { throw "Unexpected source table count: $($tables.Count). Review the archive before restoring." }
$listPath = Join-Path $directory 'selected-objects.list'
$selected | Set-Content -LiteralPath $listPath -Encoding ASCII
$sqlPath = Join-Path $directory 'table-data-restore.sql'
& $restore --no-owner --no-acl "--use-list=$listPath" "--file=$sqlPath" $archive
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare filtered restore SQL.' }
$sql = [System.IO.File]::ReadAllText($sqlPath)
$signature = 'CREATE FUNCTION public.immutable_unaccent(text) RETURNS text'
if ([regex]::Matches($sql, [regex]::Escape($signature)).Count -ne 1) {
    throw 'Unexpected archived function definition; stop for review.'
}
# pg_dump clears search_path; the archived unqualified unaccent call needs explicit resolution.
$sql = $sql.Replace($signature, "$signature`n    SET search_path TO public, extensions, pg_catalog")
[System.IO.File]::WriteAllText($sqlPath, $sql, (New-Object System.Text.UTF8Encoding($false)))

$expected = @{}
$reader = [System.IO.File]::OpenText($sqlPath)
try {
    $currentTable = $null
    while ($null -ne ($line = $reader.ReadLine())) {
        if ($null -ne $currentTable) {
            if ($line -eq '\.') { $currentTable = $null } else { $expected[$currentTable]++ }
        } elseif ($line -match '^COPY public\.([a-z_][a-z_0-9]*) .* FROM stdin;$') {
            $currentTable = $Matches[1]
            $expected[$currentTable] = 0
        }
    }
    if ($null -ne $currentTable) { throw 'Truncated COPY data in prepared SQL.' }
} finally {
    $reader.Dispose()
}
if ($expected.Count -ne $tables.Count) { throw 'Not every source table has a COPY payload.' }
$expected | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'expected-counts.json') -Encoding UTF8

$guardPath = Join-Path $directory 'guard.sql'
@'
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected restore identity';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') THEN
    RAISE EXCEPTION 'Target public schema is not empty. No objects will be overwritten.';
  END IF;
END;
$guard$;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
'@ | Set-Content -LiteralPath $guardPath -Encoding UTF8

$checksPath = Join-Path $directory 'validate.sql'
$checks = @()
foreach ($table in ($tables | Sort-Object)) {
    $count = $expected[$table]
    $checks += "DO `$check`$ BEGIN IF (SELECT count(*) FROM public.$table) <> $count THEN RAISE EXCEPTION 'Row count mismatch: $table'; END IF; END; `$check`$;"
}
$checks += @'
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  ) THEN RAISE EXCEPTION 'Unexpected application trigger in test restore'; END IF;
END;
$check$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.immutable_unaccent(text) FROM PUBLIC, anon, authenticated;
SELECT 'TABLE_DATA_TEST_PASSED: 39 table row counts checked; application behavior NOT tested' AS result;
'@
$checks | Set-Content -LiteralPath $checksPath -Encoding UTF8
Write-Host "Prepared private restore files: $directory"
Write-Host 'Scope: public tables, sequences, data and the archived immutable_unaccent dependency. No Auth, automation, policies, indexes or foreign keys.'
if (-not $Execute) {
    Write-Host 'PREPARED ONLY: no database connection or restore performed. Run again with -Execute to restore to the hard-coded TEST project.'
    return
}

$connection = 'host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.sontvcvvtftvivysiccg sslmode=require connect_timeout=20 application_name=artmuse_restore_test'
Write-Host 'Target: artmuse-restore-test (sontvcvvtftvivysiccg). Enter ONLY its test password.'
$reportPath = Join-Path $directory 'result.json'
$previousPreference = $ErrorActionPreference
try {
    # Windows PowerShell otherwise turns native stderr into a terminating error before exit-code reporting.
    $ErrorActionPreference = 'Continue'
    & $psql "--dbname=$connection" --password --no-psqlrc --pset=pager=off --set=ON_ERROR_STOP=1 --single-transaction "--file=$guardPath" "--file=$sqlPath" "--file=$checksPath" 1> (Join-Path $directory 'restore.log') 2> (Join-Path $directory 'restore-errors.log')
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousPreference
}
[ordered]@{
    targetProject = 'sontvcvvtftvivysiccg'
    sourceSHA256 = $manifest.sha256
    finishedAt = [DateTime]::UtcNow.ToString('o')
    tableDataTestPassed = ($code -eq 0)
    checkedTables = $tables.Count
    fullRestoreTested = $false
    scope = 'Public tables/sequences/data and row counts; no application or managed schemas'
} | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
if ($code -ne 0) { throw "Test restore failed (exit $code). Transaction was not committed. Inspect private restore-errors.log." }
Write-Host 'PASSED: 39 tables restored and row counts match the archive. Full restoration is NOT yet tested.'
