$ErrorActionPreference = 'Stop'
$taskRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$taskWebRoot = Join-Path $taskRepoRoot 'web'
$taskVite = Join-Path $taskWebRoot 'node_modules\vite\bin\vite.js'
$taskBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskNode = if (Test-Path -LiteralPath $taskBundledNode) { $taskBundledNode } else { (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $taskVite)) {
  throw 'Install the locked frontend dependencies first: npm --prefix web ci'
}
Write-Output 'Speech check: http://localhost:5173/#/speech-check'
Write-Output 'Open that address in desktop Chrome. Press Ctrl+C here to stop the server.'
Push-Location -LiteralPath $taskWebRoot
try {
  & $taskNode $taskVite --host localhost --port 5173 --strictPort
} finally {
  Pop-Location
}
