param(
  [string]$AccessPath = '\\serveur\Company\9010 BASES\biblio\bibliotheque.accde',
  [switch]$DryRun,
  [int]$BatchSize = 200
)

$ErrorActionPreference = 'Stop'

function Get-EnvValue([string]$name) {
  $line = Get-Content -LiteralPath '.env.local' | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { throw "Missing $name in .env.local" }
  return $line.Substring($name.Length + 1).Trim().Trim('"').Trim("'")
}

function Invoke-Supabase([string]$table, [object[]]$rows, [string]$query = '') {
  if ($rows.Count -eq 0) { return @() }
  if ([string]::IsNullOrEmpty($query)) {
    $query = switch ($table) {
      'library_authors' { '?on_conflict=legacy_no' }
      'library_related_names' { '?on_conflict=legacy_no' }
      'library_books' { '?on_conflict=legacy_no' }
      'library_book_authors' { '?on_conflict=book_id,author_id' }
      'library_book_artists' { '?on_conflict=book_id,legacy_artist_no' }
      'library_exhibitions' { '?on_conflict=legacy_no' }
      default { '' }
    }
  }
  $headers = @{
    apikey = $script:serviceRoleKey
    Authorization = "Bearer $script:serviceRoleKey"
    'Content-Type' = 'application/json'
    Prefer = 'resolution=merge-duplicates,return=representation'
  }
  $uri = "$script:supabaseUrl/rest/v1/$table$query"
  $body = ConvertTo-Json -InputObject @($rows) -Depth 10 -Compress
  try {
    return @(Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)))
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      $reader = New-Object IO.StreamReader($response.GetResponseStream())
      $detail = $reader.ReadToEnd()
      $reader.Close()
      throw "Supabase insert failed for $table ($($response.StatusCode)): $detail"
    }
    throw
  }
}

function Get-SupabaseRows([string]$uri) {
  $headers = @{ apikey = $script:serviceRoleKey; Authorization = "Bearer $script:serviceRoleKey" }
  $response = Invoke-WebRequest -Method Get -Uri $uri -Headers $headers -UseBasicParsing
  $parsed = $response.Content | ConvertFrom-Json
  if ($parsed -is [System.Array]) { return $parsed }
  return @($parsed)
}

function Get-AccessRows($db, [string]$table, [scriptblock]$map) {
  $csvPath = Join-Path $script:accessExportDir "$table.csv"
  $script:accessApp.DoCmd.TransferText(2, $null, $table, $csvPath, $true)
  $recordset = Import-Csv -LiteralPath $csvPath
  $rows = [System.Collections.Generic.List[object]]::new()
  try {
    foreach ($row in $recordset) {
      [void]$rows.Add((& $map $row))
    }
  } finally {
    Remove-Item -LiteralPath $csvPath -Force -ErrorAction SilentlyContinue
  }
  return @($rows)
}

function Value($recordset, [string]$field) {
  if ($recordset.PSObject.Properties.Name -contains $field) {
    $value = $recordset.$field
  } else {
    $value = $recordset.Fields.Item($field).Value
  }
  if ($null -eq $value -or $value -is [System.DBNull]) { return $null }
  if ($value -is [string] -and [string]::IsNullOrWhiteSpace($value)) { return $null }
  return $value
}

function AccessDate($recordset, [string]$field) {
  $value = Value $recordset $field
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace($value.ToString())) { return $null }
  return ([datetime]::Parse($value.ToString())).ToString('yyyy-MM-dd')
}

function IntegerValue($recordset, [string]$field) {
  $value = Value $recordset $field
  if ($null -eq $value) { return $null }
  $parsed = 0
  if ([int]::TryParse($value.ToString(), [Globalization.NumberStyles]::Integer, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return $parsed
  }
  return $null
}

function NameKey([string]$lastName, [string]$firstName) {
  $lastValue = if ($null -eq $lastName) { '' } else { $lastName }
  $firstValue = if ($null -eq $firstName) { '' } else { $firstName }
  $last = ([regex]::Replace($lastValue, '\s+', ' ')).Trim().ToLowerInvariant()
  $first = ([regex]::Replace($firstValue, '\s+', ' ')).Trim().ToLowerInvariant()
  return "$last|$first"
}

$script:supabaseUrl = Get-EnvValue 'NEXT_PUBLIC_SUPABASE_URL'
$script:serviceRoleKey = Get-EnvValue 'SUPABASE_SERVICE_ROLE_KEY'
if (-not (Test-Path -LiteralPath $AccessPath)) { throw "Access file not found: $AccessPath" }

$access = New-Object -ComObject Access.Application
$script:accessExportDir = Join-Path $env:TEMP ("artmuse-library-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $script:accessExportDir | Out-Null
try {
  $access.OpenCurrentDatabase($AccessPath, $true)
  $script:accessApp = $access
  $db = $access.CurrentDb()

  $artists = Get-AccessRows $db 'TDIArtistes' {
    param($rs)
    $birthYear = Value $rs 'TDAAnneeNaissance'
    $deathYear = Value $rs 'TDAAnneeDeces'
    $historicalYears = @(
      if ($birthYear -and $null -eq (IntegerValue $rs 'TDAAnneeNaissance')) { "Birth year: $birthYear" }
      if ($deathYear -and $null -eq (IntegerValue $rs 'TDAAnneeDeces')) { "Death year: $deathYear" }
    ) -join '; '
    $noteParts = @((Value $rs 'TDACategorie'), $historicalYears) | Where-Object { $_ }
    $notes = $noteParts -join '; '
    [ordered]@{
      legacy_no = [int](Value $rs 'TDANo')
      last_name = Value $rs 'TDAArtiste'
      first_name = Value $rs 'TDAPrenom'
      year_of_birth = IntegerValue $rs 'TDAAnneeNaissance'
      year_of_death = IntegerValue $rs 'TDAAnneeDeces'
      place_of_birth = Value $rs 'TDALieuNaissance'
      place_of_death = Value $rs 'TDALieuDeces'
      notes = $notes
    }
  }
  $authors = Get-AccessRows $db 'TDIAuteurs' {
    param($rs)
    [ordered]@{ legacy_no = [int](Value $rs 'TDUNo'); last_name = Value $rs 'TDUNom'; first_name = Value $rs 'TDUPrenom' }
  }
  $relatedNames = Get-AccessRows $db 'TDIRelatedNames' {
    param($rs)
    [ordered]@{ legacy_no = [int](Value $rs 'TDRNo'); name = Value $rs 'TDRNom'; location = Value $rs 'TDRLieu' }
  }
  $books = Get-AccessRows $db 'TLILivres' {
    param($rs)
    [ordered]@{
      legacy_no = [int](Value $rs 'TLINo')
      entered_at = AccessDate $rs 'TLIDateSaisie'
      type_no = Value $rs 'TLINoType'
      status_no = Value $rs 'TLIStatus'
      title = Value $rs 'TLITitre'
      publisher_no = Value $rs 'TLINoEditeur'
      publication_year = IntegerValue $rs 'TLIAnnee'
      volume = Value $rs 'TLIVolume'
      series = Value $rs 'TLISeries'
      remarks = Value $rs 'TLIRemarques'
      isbn = Value $rs 'TLIISBN'
      copy = Value $rs 'TLICopy'
      search_artist = Value $rs 'TLISearchArt'
      search_author = Value $rs 'TLISearchAut'
      search_exhibition = Value $rs 'TLISearchExh'
      search_publisher = Value $rs 'TLISearchEdi'
    }
  }
  $bookArtists = Get-AccessRows $db 'TLIArtistes' {
    param($rs)
    [ordered]@{ book_no = [int](Value $rs 'TLANoLivre'); artist_no = [int](Value $rs 'TLANoArtiste'); is_default = [bool](Value $rs 'TLADefaut') }
  }
  $bookAuthors = Get-AccessRows $db 'TLIAuteurs' {
    param($rs)
    [ordered]@{ book_no = [int](Value $rs 'TLUNoLivre'); author_no = [int](Value $rs 'TLUNoAuteur'); is_default = [bool](Value $rs 'TLUDefaut') }
  }
  $exhibitions = Get-AccessRows $db 'TLIExhibitions' {
    param($rs)
    [ordered]@{
      legacy_no = [int](Value $rs 'TLENo')
      book_no = [int](Value $rs 'TLENoLivre')
      related_name_no = Value $rs 'TLENoRelatedNames'
      starts_on = AccessDate $rs 'TLEDebut'
      ends_on = AccessDate $rs 'TLEFin'
    }
  }
} finally {
  if ($access) {
    $access.CloseCurrentDatabase()
    $access.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($access) | Out-Null
  }
  Remove-Item -LiteralPath $script:accessExportDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Access source: $($books.Count) books, $($artists.Count) artists, $($authors.Count) authors"
if ($DryRun) { exit 0 }

$restHeaders = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" }
$existingArtists = @(Get-SupabaseRows "$supabaseUrl/rest/v1/artists?select=id,first_name,last_name")
$artistIds = @{}
foreach ($artist in $existingArtists) { $artistIds[(NameKey $artist.last_name $artist.first_name)] = $artist.id }

$newArtists = @($artists | Where-Object { -not $artistIds.ContainsKey((NameKey $_.last_name $_.first_name)) } | ForEach-Object {
  $lastName = if ([string]::IsNullOrWhiteSpace($_.last_name)) { 'Unknown' } else { $_.last_name }
  [ordered]@{ first_name = $_.first_name; last_name = $lastName; year_of_birth = $_.year_of_birth; year_of_death = $_.year_of_death; place_of_birth = $_.place_of_birth; place_of_death = $_.place_of_death; notes = $_.notes }
})
for ($offset = 0; $offset -lt $newArtists.Count; $offset += $BatchSize) {
  $batch = @($newArtists | Select-Object -Skip $offset -First $BatchSize)
  [void](Invoke-Supabase 'artists' $batch)
}
$existingArtists = @(Get-SupabaseRows "$supabaseUrl/rest/v1/artists?select=id,first_name,last_name")
foreach ($artist in $existingArtists) { $artistIds[(NameKey $artist.last_name $artist.first_name)] = $artist.id }
$legacyArtistIds = @{}
foreach ($artist in $artists) { $legacyArtistIds[[int]$artist.legacy_no] = $artistIds[(NameKey $artist.last_name $artist.first_name)] }

foreach ($definition in @(
  @{ Name = 'library_authors'; Rows = $authors },
  @{ Name = 'library_related_names'; Rows = $relatedNames },
  @{ Name = 'library_books'; Rows = $books }
)) {
  for ($offset = 0; $offset -lt $definition.Rows.Count; $offset += $BatchSize) {
    $batch = @($definition.Rows | Select-Object -Skip $offset -First $BatchSize)
    [void](Invoke-Supabase $definition.Name $batch)
  }
}

$allBooks = @(Get-SupabaseRows "$supabaseUrl/rest/v1/library_books?select=id,legacy_no")
$allAuthors = @(Get-SupabaseRows "$supabaseUrl/rest/v1/library_authors?select=id,legacy_no")
$bookIds = @{}; foreach ($row in $allBooks) { $bookIds[[int]$row.legacy_no] = $row.id }
$authorIds = @{}; foreach ($row in $allAuthors) { $authorIds[[int]$row.legacy_no] = $row.id }

$bookAuthorRows = @($bookAuthors | ForEach-Object { if ($bookIds.ContainsKey($_.book_no) -and $authorIds.ContainsKey($_.author_no)) { [ordered]@{ book_id = $bookIds[$_.book_no]; author_id = $authorIds[$_.author_no]; is_default = $_.is_default } } })
$bookArtistRows = @($bookArtists | ForEach-Object { if ($bookIds.ContainsKey($_.book_no)) { [ordered]@{ book_id = $bookIds[$_.book_no]; artist_id = $legacyArtistIds[$_.artist_no]; legacy_artist_no = $_.artist_no; is_default = $_.is_default } } })
$exhibitionRows = @($exhibitions | ForEach-Object { if ($bookIds.ContainsKey($_.book_no)) { [ordered]@{ legacy_no = $_.legacy_no; book_id = $bookIds[$_.book_no]; related_name_no = $_.related_name_no; starts_on = $_.starts_on; ends_on = $_.ends_on } } })

foreach ($definition in @(
  @{ Name = 'library_book_authors'; Rows = $bookAuthorRows },
  @{ Name = 'library_book_artists'; Rows = $bookArtistRows },
  @{ Name = 'library_exhibitions'; Rows = $exhibitionRows }
)) {
  for ($offset = 0; $offset -lt $definition.Rows.Count; $offset += $BatchSize) {
    $batch = @($definition.Rows | Select-Object -Skip $offset -First $BatchSize)
    [void](Invoke-Supabase $definition.Name $batch)
  }
}

Write-Host "Import complete: $($books.Count) books, $($bookAuthors.Count) author links, $($bookArtists.Count) artist links, $($exhibitions.Count) exhibitions"