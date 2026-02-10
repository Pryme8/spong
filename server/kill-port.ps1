# Kill any process using port 3000
$port = 3000

Write-Host "Checking for processes on port $port..."

# Try multiple times with different methods
for ($attempt = 1; $attempt -le 3; $attempt++) {
    $processIds = netstat -ano | Select-String ":$port\s" | ForEach-Object {
        $line = $_.Line
        if ($line -match '\s+(\d+)\s*$') {
            $matches[1]
        }
    } | Select-Object -Unique

    if ($processIds) {
        Write-Host "Attempt $attempt - Found processes: $($processIds -join ', ')"
        foreach ($processId in $processIds) {
            Write-Host "  Killing process $processId..."
            try {
                # Try taskkill first (more aggressive)
                taskkill /F /PID $processId 2>&1 | Out-Null
                Write-Host "  Killed $processId with taskkill"
            }
            catch {
                try {
                    # Fallback to Stop-Process
                    Stop-Process -Id $processId -Force -ErrorAction Stop
                    Write-Host "  Killed $processId with Stop-Process"
                }
                catch {
                    Write-Host "  Failed to kill $processId"
                }
            }
        }
        
        # Wait progressively longer
        $waitTime = 1 + $attempt
        Write-Host "Waiting $waitTime seconds for port to be released..."
        Start-Sleep -Seconds $waitTime
    }
    else {
        Write-Host "No process found on port $port"
        break
    }
}

Write-Host "Port cleanup complete"
