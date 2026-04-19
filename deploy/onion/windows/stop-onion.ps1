Get-Process python, py, tor -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host 'Stopped python/py/tor processes that were running under the current user context.'
