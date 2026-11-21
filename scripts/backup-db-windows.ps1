param(
  [string]$OutputDirectory = (Join-Path $HOME 'Documents\FutLink-db-migration')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot 'backend/.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "No existe $envFile. Crea backend/.env y configura DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME."
}

$db = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^\s*(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)\s*=\s*(.*)\s*$') {
    $key = $matches[1]
    $value = $matches[2].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $db[$key] = $value
  }
}

foreach ($key in @('DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME')) {
  if (-not $db.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($db[$key])) {
    throw "Falta $key en backend/.env."
  }
}

$pgDumpCommand = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
$pgRestoreCommand = Get-Command pg_restore.exe -ErrorAction SilentlyContinue
$pgDump = if ($pgDumpCommand) { $pgDumpCommand.Source } else { $null }
$pgRestore = if ($pgRestoreCommand) { $pgRestoreCommand.Source } else { $null }
if (-not $pgDump -or -not $pgRestore) {
  $installations = Get-ChildItem (Join-Path $env:ProgramFiles 'PostgreSQL') -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]$_.Name } -Descending
  foreach ($installation in $installations) {
    $candidateDump = Join-Path $installation.FullName 'bin/pg_dump.exe'
    $candidateRestore = Join-Path $installation.FullName 'bin/pg_restore.exe'
    if ((Test-Path $candidateDump) -and (Test-Path $candidateRestore)) {
      $pgDump = $candidateDump
      $pgRestore = $candidateRestore
      break
    }
  }
}
if (-not $pgDump -or -not $pgRestore) {
  throw 'No se encontraron pg_dump y pg_restore. Instala las herramientas de línea de comandos de PostgreSQL.'
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpPath = Join-Path $OutputDirectory "Futlink-$timestamp.dump"
$partialPath = "$dumpPath.partial"
$tocPath = "$dumpPath.list.txt"

try {
  $env:PGPASSWORD = $db.DB_PASSWORD
  & $pgDump `
    --format=custom `
    --no-owner `
    --no-acl `
    --verbose `
    --host $db.DB_HOST `
    --port $db.DB_PORT `
    --username $db.DB_USER `
    --dbname $db.DB_NAME `
    --file $partialPath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump terminó con código $LASTEXITCODE."
  }

  & $pgRestore --list $partialPath | Set-Content -LiteralPath $tocPath
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo validar el archivo con pg_restore (código $LASTEXITCODE)."
  }

  Move-Item -LiteralPath $partialPath -Destination $dumpPath
  $hash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$dumpPath.sha256" -Value "$hash  $(Split-Path -Leaf $dumpPath)"

  Write-Output "Respaldo listo: $dumpPath"
  Write-Output "SHA-256: $hash"
  Write-Output "Contenido del respaldo: $tocPath"
} catch {
  Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tocPath -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
