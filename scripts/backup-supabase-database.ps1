param(
    [string]$OutputDirectory = 'C:\DEV\artmuse',
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
    [switch]$Unattended
)

$ErrorActionPreference = 'Stop'
$dump = Join-Path $PostgresBin 'pg_dump.exe'
$restore = Join-Path $PostgresBin 'pg_restore.exe'
foreach ($tool in @($dump, $restore)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "Required PostgreSQL tool not found: $tool"
    }
}
if (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    throw 'The output directory must be an absolute path on a private encrypted disk.'
}
if ($Unattended -and [string]::IsNullOrWhiteSpace($env:PGPASSWORD)) {
    throw 'Unattended export requires a database password supplied through the process environment.'
}

function Invoke-ArchiveTool([string]$Tool, [string[]]$ToolArguments) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Tool @ToolArguments 2>> $log
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($code -ne 0) { throw "PostgreSQL archive tool failed (exit $code). See the private backup.log file." }
}

$connection = 'host=aws-0-eu-west-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.cdbtgjhbgswpdehqwjnn sslmode=require connect_timeout=20 application_name=artmuse_backup'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$directory = Join-Path $OutputDirectory ("supabase-database-$stamp-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$archive = Join-Path $directory 'database.dump'
$partial = "$archive.partial"
$manifestPath = Join-Path $directory 'manifest.json'
$log = Join-Path $directory 'backup.log'
$manifest = [ordered]@{
    version = 1
    complete = $false
    startedAt = [DateTime]::UtcNow.ToString('o')
    project = 'cdbtgjhbgswpdehqwjnn'
    database = 'postgres'
    format = 'PostgreSQL custom archive'
    restoreTested = $false
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

try {
    Write-Host "Backup directory: $directory"
    $passwordOption = '--password'
    if ($Unattended) {
        $passwordOption = '--no-password'
        Write-Host 'Unattended database export; no password prompt.'
    } else {
        Write-Host 'Enter the database password at the PostgreSQL prompt. It will not be recorded.'
    }
    "[$([DateTime]::UtcNow.ToString('o'))] Database export started" | Add-Content -LiteralPath $log
    Invoke-ArchiveTool $dump @("--dbname=$connection", $passwordOption, '--format=custom', '--lock-wait-timeout=30s', "--file=$partial")
    if ((Get-Item -LiteralPath $partial).Length -eq 0) {
        throw 'pg_dump produced an empty archive.'
    }

    Invoke-ArchiveTool $restore @('--list', "--file=$(Join-Path $directory 'archive-contents.txt')", $partial)
    # Read and decompress the archive without executing SQL against a database.
    Invoke-ArchiveTool $restore @('--file=NUL', $partial)
    Move-Item -LiteralPath $partial -Destination $archive
    $manifest['bytes'] = (Get-Item -LiteralPath $archive).Length
    $manifest['sha256'] = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest['toolVersion'] = (& $dump --version | Out-String).Trim()
    $manifest['finishedAt'] = [DateTime]::UtcNow.ToString('o')
    $manifest['complete'] = $true
    $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    "[$([DateTime]::UtcNow.ToString('o'))] COMPLETE: $($manifest['bytes']) bytes" | Add-Content -LiteralPath $log
    Write-Host 'COMPLETE: archive created, read back and SHA-256 recorded. Restoration has NOT been tested.'
    Write-Host 'This exports database objects accessible to the PostgreSQL user, not Storage files, cluster roles, platform configuration or encryption root keys.'
} catch {
    $manifest['complete'] = $false
    $manifest['failedAt'] = [DateTime]::UtcNow.ToString('o')
    $manifest['failure'] = $_.Exception.Message
    $manifest | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    "[$([DateTime]::UtcNow.ToString('o'))] FAILED: $($_.Exception.Message)" | Add-Content -LiteralPath $log
    throw
}
