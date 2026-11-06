param(
    [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$directory = 'C:\Program Files\ArtMuseTools\BackupSecrets'
$path = Join-Path $directory 'supabase-production.dpapi.json'
if ($env:COMPUTERNAME -ne 'SERVEUR') {
    throw 'Run this script on SERVEUR only. Machine-bound secrets cannot be deployed from another computer.'
}
Add-Type -AssemblyName System.Security
$serviceSid = ([System.Security.Principal.NTAccount]::new('BLONDEAU\svc_artmuse_backup')).Translate([System.Security.Principal.SecurityIdentifier]).Value
$allowed = @('S-1-5-18', 'S-1-5-32-544', $serviceSid)

function Assert-PrivateAcl([string]$ItemPath, [switch]$RequireProtected) {
    $acl = Get-Acl -LiteralPath $ItemPath -ErrorAction Stop
    if ($RequireProtected -and -not $acl.AreAccessRulesProtected) {
        throw 'Secret directory must have protected inheritance.'
    }
    $rules = $acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
    if (@($rules).Count -eq 0) { throw 'No secret access rules found.' }
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin $allowed -or $rule.AccessControlType -ne 'Allow') {
            throw 'Unexpected secret permissions. Stop and review the ACL before entering credentials.'
        }
        $readOnlyRights = [System.Security.AccessControl.FileSystemRights]::ReadAndExecute -bor
            [System.Security.AccessControl.FileSystemRights]::Synchronize
        if ($rule.IdentityReference.Value -eq $serviceSid -and
            ($rule.FileSystemRights -band $readOnlyRights) -ne $rule.FileSystemRights) {
            throw 'The service account must have only read/execute access to secrets.'
        }
    }
}

Assert-PrivateAcl $directory -RequireProtected
if ($VerifyOnly) {
    Assert-PrivateAcl $path
    $envelope = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($envelope.version -ne 1 -or $envelope.machine -ne 'SERVEUR' -or
        $envelope.scope -ne 'LocalMachine' -or $envelope.project -ne 'cdbtgjhbgswpdehqwjnn') {
        throw 'Unexpected encrypted secret file.'
    }
    $plainBytes = $null
    try {
        $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
            [Convert]::FromBase64String($envelope.ciphertext), $null,
            [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
        $credentials = [System.Text.Encoding]::UTF8.GetString($plainBytes) | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace($credentials.databasePassword) -or
            [string]::IsNullOrWhiteSpace($credentials.storageKey)) {
            throw 'Decrypted secrets are incomplete.'
        }
        Write-Host 'VERIFIED: machine-bound secrets decrypt successfully. Values were not displayed. Remote authentication is NOT tested.'
    } finally {
        if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
        $credentials = $null
    }
    return
}
if (Test-Path -LiteralPath $path) {
    throw 'Secrets already exist. No overwrite allowed; review rotation separately or run with -VerifyOnly.'
}
Write-Host 'Enter PRODUCTION credentials from the professional vault, not test-project credentials.'
Write-Host 'Input is masked. Nothing will connect to Supabase or activate the service account.'
$password = Read-Host 'Production PostgreSQL password' -AsSecureString
$key = Read-Host 'Production Storage server key (secret or legacy service_role)' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$keyPointer = [IntPtr]::Zero
$plainBytes = $null
try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
    $databasePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $storageKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    if ([string]::IsNullOrWhiteSpace($databasePassword) -or [string]::IsNullOrWhiteSpace($storageKey)) {
        throw 'Both credentials are required.'
    }
    if ($storageKey -notmatch '^sb_secret_[A-Za-z0-9_-]+$') {
        $parts = $storageKey.Split('.')
        if ($parts.Count -ne 3) { throw 'Expected a server secret key or legacy service_role JWT.' }
        $payload = $parts[1].Replace('-', '+').Replace('_', '/')
        $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
        $claims = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
        if ($claims.role -ne 'service_role' -or $claims.ref -ne 'cdbtgjhbgswpdehqwjnn') {
            throw 'Legacy key must have service_role and the expected production project reference.'
        }
    }
    $json = [ordered]@{ databasePassword = $databasePassword; storageKey = $storageKey } | ConvertTo-Json -Compress
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $encrypted = [System.Security.Cryptography.ProtectedData]::Protect(
        $plainBytes, $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
    $envelope = [ordered]@{
        version = 1; machine = 'SERVEUR'; scope = 'LocalMachine'
        project = 'cdbtgjhbgswpdehqwjnn'; createdAt = [DateTime]::UtcNow.ToString('o')
        ciphertext = [Convert]::ToBase64String($encrypted)
    } | ConvertTo-Json
    $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($envelope)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally {
        $stream.Dispose()
    }
    Assert-PrivateAcl $path
    Write-Host 'SAVED: production secrets encrypted with SERVEUR LocalMachine DPAPI. Run -VerifyOnly next.'
    Write-Host 'Keep original credentials in the professional vault. This file alone cannot recover secrets on another server.'
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
    if ($null -ne $plainBytes) { [Array]::Clear($plainBytes, 0, $plainBytes.Length) }
    $databasePassword = $null
    $storageKey = $null
    $json = $null
    $password.Dispose()
    $key.Dispose()
}
