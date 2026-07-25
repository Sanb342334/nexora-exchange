# Kill stale dev servers
Get-NetTCPConnection -LocalPort 3000,3001,4000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Clean broken Next.js cache (main cause of 500 errors)
Remove-Item -Recurse -Force "$PSScriptRoot\..\frontend\.next" -ErrorAction SilentlyContinue

Write-Host "Starting PostgreSQL (embedded, port 5433)..."
Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$PSScriptRoot\..\backend'; node scripts/start-local-db.js`"" -WindowStyle Minimized

Start-Sleep -Seconds 8

Write-Host "Running migrations..."
Set-Location "$PSScriptRoot\..\backend"
npm run prisma:deploy 2>$null

Write-Host "Starting backend (port 4000)..."
Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$PSScriptRoot\..\backend'; npm run start:dev`"" -WindowStyle Minimized

Start-Sleep -Seconds 12

Write-Host "Starting frontend (port 3000)..."
Start-Process powershell -ArgumentList "-NoProfile -Command `"cd '$PSScriptRoot\..\frontend'; npm run dev`"" -WindowStyle Minimized

Write-Host ""
Write-Host "Ready:"
Write-Host "  Frontend: http://localhost:3000"
Write-Host "  Backend:  http://localhost:4000/api/docs"
Write-Host "  Login:    admin / Admin12345!"
