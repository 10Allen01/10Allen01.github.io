# Windows Onion Scripts

## Files

- `start-onion.ps1` builds the site, starts a local static server, writes a Tor config, starts Tor, waits for the generated hostname, and writes `PUBLIC_ONION_URL` into `.env`.
- `stop-onion.ps1` stops local Python and Tor processes.

## Expected Tor path

By default the main script expects:

```text
C:\tor\tor.exe
```

If your Tor executable is elsewhere, pass `-TorExePath` when running the script.

## Example

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\onion\windows\start-onion.ps1
```
