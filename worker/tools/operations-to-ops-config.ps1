param(
  [Parameter(Mandatory=$true)]
  [string]$OperationsYamlPath,
  [string]$OutPath = "$PSScriptRoot\\ops-config.json"
)

# Converts _data/operations.yml into a KV-friendly JSON mapping:
# { "op-001": { "roles": { "SEAD": 10, ... } }, ... }

if (!(Test-Path -LiteralPath $OperationsYamlPath)) {
  throw "File not found: $OperationsYamlPath"
}

# Requires powershell-yaml (safe, common) for parsing
if (-not (Get-Module -ListAvailable -Name powershell-yaml)) {
  throw "Missing module 'powershell-yaml'. Install with: Install-Module powershell-yaml -Scope CurrentUser"
}

Import-Module powershell-yaml

$yamlText = Get-Content -LiteralPath $OperationsYamlPath -Raw
$ops = ConvertFrom-Yaml $yamlText

$cfg = @{}
foreach ($op in $ops) {
  if (-not $op.id) { continue }
  $rolesMap = @{}
  foreach ($r in ($op.roles | ForEach-Object { $_ })) {
    if ($null -eq $r) { continue }
    if (-not $r.name) { continue }
    $aircraft = if ($r.aircraft) { [string]$r.aircraft } else { "" }
    $key = "{0}|{1}" -f [string]$r.name, $aircraft
    $rolesMap[$key] = [int]$r.slots
  }
  $cfg[$op.id] = @{ roles = $rolesMap }
}

($cfg | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $OutPath -Encoding UTF8
Write-Host "Wrote $OutPath"
