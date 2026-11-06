$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'SERVEUR') { throw 'Run this script on SERVEUR only.' }
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
if (-not (Test-Path -LiteralPath $psql -PathType Leaf)) { throw 'PostgreSQL psql tool is missing.' }
# Reuse the provisioning script's ACL, envelope and local decryption checks.
& (Join-Path $PSScriptRoot 'initialize-backup-secrets.ps1') -VerifyOnly
$path = 'C:\Program Files\ArtMuseTools\BackupSecrets\supabase-production.dpapi.json'
$reportPath = Join-Path 'D:\Company\9010 BASES\artmuse\sauvegarde\automated' ('connectivity-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
try {
    $executionUser = $identity.Name
    $executionSid = $identity.User.Value
} finally {
    $identity.Dispose()
}
$expectedSid = ([System.Security.Principal.NTAccount]::new('BLONDEAU\svc_artmuse_backup')).Translate([System.Security.Principal.SecurityIdentifier]).Value
$report = [ordered]@{
    project = 'cdbtgjhbgswpdehqwjnn'
    startedAt = [DateTime]::UtcNow.ToString('o')
    executionUser = $executionUser
    executionSid = $executionSid
    computer = $env:COMPUTERNAME
    processId = $PID
    databaseReadPassed = $false
    storageBucketReadPassed = $false
    taskIdentityTested = $false
    backupPerformed = $false
}
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
$plainBytes = $null
$credentials = $null
$client = $null
$handler = $null
$response = $null
$previousPassword = $env:PGPASSWORD
$previousOptions = $env:PGOPTIONS
$stage = 'local secret loading'
try {
    $envelope = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        [Convert]::FromBase64String($envelope.ciphertext), $null,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
    $credentials = [System.Text.Encoding]::UTF8.GetString($plainBytes) | ConvertFrom-Json
    $stage = 'PostgreSQL read-only connection'
    $connection = 'host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.cdbtgjhbgswpdehqwjnn sslmode=require connect_timeout=20 application_name=artmuse_backup_probe'
    $env:PGPASSWORD = $credentials.databasePassword
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000'
    $query = @'
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT json_build_object(
  'database', current_database(),
  'user', current_user,
  'readOnly', current_setting('transaction_read_only'),
  'publicTables', (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
  'requiredBuckets', (SELECT count(*) FROM storage.buckets
    WHERE id IN ('artwork-images','artwork-imports','artwork-thumbnails'))
);
COMMIT;
'@
    $preference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $result = & $psql "--dbname=$connection" --no-password --no-psqlrc --no-align --tuples-only --quiet --set=ON_ERROR_STOP=1 --pset=pager=off "--command=$query" 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $preference
        $env:PGPASSWORD = $previousPassword
        $env:PGOPTIONS = $previousOptions
    }
    if ($code -ne 0) { throw "PostgreSQL probe failed (exit $code). Check server network access and production database credentials." }
    $metadata = ($result | Out-String).Trim() | ConvertFrom-Json
    $report.databaseMetadata = [ordered]@{
        database = $metadata.database
        user = $metadata.user
        readOnly = $metadata.readOnly
        publicTables = $metadata.publicTables
        requiredBuckets = $metadata.requiredBuckets
    }
    Write-Host ('PostgreSQL metadata: ' + ($report.databaseMetadata | ConvertTo-Json -Compress))
    if ($metadata.database -ne 'postgres' -or $metadata.user -ne 'postgres' -or
        $metadata.readOnly -ne 'on' -or $metadata.publicTables -ne 39 -or $metadata.requiredBuckets -ne 3) {
        throw 'Unexpected production database state; expected postgres identity, read-only transaction, 39 public tables and three Storage buckets. Stop for review.'
    }
    $report.databaseReadPassed = $true
    Write-Host 'PASSED: PostgreSQL authentication and read-only metadata query.'

    $stage = 'Storage bucket metadata connection'
    Add-Type -AssemblyName System.Net.Http
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(60)
    [void]$client.DefaultRequestHeaders.TryAddWithoutValidation('apikey', $credentials.storageKey)
    if ($credentials.storageKey -notlike 'sb_secret_*') {
        $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $credentials.storageKey)
    }
    $response = $client.GetAsync('https://cdbtgjhbgswpdehqwjnn.supabase.co/storage/v1/bucket').GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
        throw "Storage metadata request returned HTTP $([int]$response.StatusCode). No response body or credential was logged."
    }
    $items = @($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
    foreach ($bucket in @('artwork-images', 'artwork-imports', 'artwork-thumbnails')) {
        if (@($items | Where-Object { $_.id -eq $bucket }).Count -ne 1) {
            throw 'Storage metadata did not contain exactly one entry for each required production bucket.'
        }
    }
    $report.storageBucketReadPassed = $true
    $report.taskIdentityTested = ($executionSid -eq $expectedSid)
    Write-Host 'PASSED: Storage server authentication and three bucket metadata entries. No object downloaded or changed.'
} catch {
    # Never emit native/HTTP exceptions that could include credentials or response content.
    $report.failureStage = $stage
    $message = $_.Exception.Message
    if ($message -match '^(PostgreSQL probe failed \(exit \d+\)\.|Unexpected production database state;|Storage metadata request returned HTTP \d+\.|Storage metadata did not contain exactly one entry)') {
        $report.failure = $message
    } else {
        $report.failure = "Probe failed during $stage. Details suppressed to protect credentials; investigate this stage without sharing secrets."
    }
    throw $report.failure
} finally {
    $env:PGPASSWORD = $previousPassword
    $env:PGOPTIONS = $previousOptions
    if ($null -ne $response) { $response.Dispose() }
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $handler) { $handler.Dispose() }
    if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    $credentials = $null
    $result = $null
    $report.finishedAt = [DateTime]::UtcNow.ToString('o')
    $report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host "Private connectivity report: $reportPath"
}
if ($report.taskIdentityTested) {
    Write-Host 'VERIFIED: both production read checks passed under the dedicated Windows account. Backups and daily scheduling are NOT yet tested.'
} else {
    Write-Host 'VERIFIED: production read connectivity from this process. Service-account execution, backups and daily scheduling are NOT yet tested.'
}
