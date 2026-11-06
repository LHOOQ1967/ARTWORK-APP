$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'SERVEUR') { throw 'Run this script on SERVEUR only.' }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
try {
    $executionUser = $identity.Name
    $executionSid = $identity.User.Value
} finally {
    $identity.Dispose()
}
$expectedSid = ([System.Security.Principal.NTAccount]::new('BLONDEAU\svc_artmuse_backup')).Translate([System.Security.Principal.SecurityIdentifier]).Value
if ($executionSid -ne $expectedSid) { throw 'Run this wrapper through a task using the dedicated backup account only.' }
$root = 'D:\Company\9010 BASES\artmuse\sauvegarde\automated'
$lock = [System.IO.File]::Open((Join-Path $root 'database-backup.lock'), [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
$previousPassword = $env:PGPASSWORD
$plainBytes = $null
$credentials = $null
$reportPath = Join-Path $root ('database-run-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.json')
$report = [ordered]@{
    project = 'cdbtgjhbgswpdehqwjnn'; executionUser = $executionUser
    startedAt = [DateTime]::UtcNow.ToString('o')
    databaseBackupPassed = $false; storageBackupPerformed = $false
    restoreTested = $false
}
try {
    $report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
    & (Join-Path $PSScriptRoot 'initialize-backup-secrets.ps1') -VerifyOnly
    $envelope = Get-Content -LiteralPath 'C:\Program Files\ArtMuseTools\BackupSecrets\supabase-production.dpapi.json' -Raw | ConvertFrom-Json
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        [Convert]::FromBase64String($envelope.ciphertext), $null,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
    $credentials = [System.Text.Encoding]::UTF8.GetString($plainBytes) | ConvertFrom-Json
    $env:PGPASSWORD = $credentials.databasePassword
    # Each run gets its own container so validation cannot select an older archive.
    $output = Join-Path $root ([System.IO.Path]::GetFileNameWithoutExtension($reportPath))
    & (Join-Path $PSScriptRoot 'backup-supabase-database.ps1') -OutputDirectory $output -Unattended
    $manifests = @(Get-ChildItem -LiteralPath $output -Filter manifest.json -File -Recurse -ErrorAction Stop)
    if ($manifests.Count -ne 1) { throw 'Expected exactly one new archive manifest.' }
    $manifest = Get-Content -LiteralPath $manifests[0].FullName -Raw | ConvertFrom-Json
    $archive = Join-Path $manifests[0].DirectoryName 'database.dump'
    if ($manifest.complete -ne $true -or $manifest.project -ne $report.project -or
        (Get-Item -LiteralPath $archive).Length -ne $manifest.bytes -or
        (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) {
        throw 'New database archive verification failed.'
    }
    $report.archiveDirectory = $manifests[0].DirectoryName
    $report.bytes = $manifest.bytes
    $report.sha256 = $manifest.sha256
    $report.databaseBackupPassed = $true
} catch {
    $failure = $_.Exception.Message
    if ($null -ne $credentials) {
        foreach ($secret in @($credentials.databasePassword, $credentials.storageKey)) {
            if (-not [string]::IsNullOrEmpty($secret)) { $failure = $failure.Replace($secret, '[REDACTED]') }
        }
    }
    $report.failure = "Database backup failed: $failure"
    throw $report.failure
} finally {
    $env:PGPASSWORD = $previousPassword
    if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    $credentials = $null
    try {
        $report.finishedAt = [DateTime]::UtcNow.ToString('o')
        $report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
    } finally {
        $lock.Dispose()
    }
}
Write-Host "PASSED: new database archive verified. Private report: $reportPath"
Write-Host 'Database only; Storage, restore testing and daily scheduling are not included.'
