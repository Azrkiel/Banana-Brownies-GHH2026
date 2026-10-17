$ErrorActionPreference = 'Stop'
$taskRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$taskServerRoot = Join-Path $taskRepoRoot 'server'
$taskPython = Join-Path $taskServerRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
  throw 'Prepare the server environment first: python -m venv server/.venv; server/.venv/Scripts/python -m pip install -r server/requirements.txt'
}
Write-Output 'Local call API: http://127.0.0.1:8000/api/health'
Write-Output 'Uses the existing ignored server configuration. Press Ctrl+C here to stop.'
Push-Location -LiteralPath $taskServerRoot
try {
  & $taskPython -m uvicorn app.main:app --host 127.0.0.1 --port 8000
} finally {
  Pop-Location
}
