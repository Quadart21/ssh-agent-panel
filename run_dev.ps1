$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$BackendEnv = Join-Path $BackendDir ".env"
$FrontendEnv = Join-Path $FrontendDir ".env"
$BackendEnvExample = Join-Path $BackendDir ".env.example"
$FrontendEnvExample = Join-Path $FrontendDir ".env.example"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"

$backendJob = $null
$frontendJob = $null

function Write-Log {
    param([string]$Message)
    Write-Host "[gui-ssh-manager] $Message"
}

function Stop-Services {
    if ($backendJob) {
        Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    }
    if ($frontendJob) {
        Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $BackendDir)) {
    throw "Missing backend directory."
}

if (-not (Test-Path $FrontendDir)) {
    throw "Missing frontend directory."
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python is not available in PATH."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not available in PATH."
}

if (-not (Test-Path $BackendEnv) -and (Test-Path $BackendEnvExample)) {
    Copy-Item $BackendEnvExample $BackendEnv
    Write-Log "Created backend/.env from example."
}

if (-not (Test-Path $FrontendEnv) -and (Test-Path $FrontendEnvExample)) {
    Copy-Item $FrontendEnvExample $FrontendEnv
    Write-Log "Created frontend/.env from example."
}

if (-not (Test-Path $VenvPython)) {
    Write-Log "Creating backend virtual environment..."
    python -m venv $VenvDir
}

Write-Log "Installing backend dependencies..."
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")

Write-Log "Installing frontend dependencies..."
Push-Location $FrontendDir
try {
    npm install
}
finally {
    Pop-Location
}

Write-Log "Starting backend on http://localhost:8000 ..."
$backendJob = Start-Job -Name "gui-ssh-backend" -ScriptBlock {
    param($BackendDir, $VenvPython)
    Set-Location $BackendDir
    & $VenvPython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} -ArgumentList $BackendDir, $VenvPython

Write-Log "Starting frontend on http://localhost:5173 ..."
$frontendJob = Start-Job -Name "gui-ssh-frontend" -ScriptBlock {
    param($FrontendDir)
    Set-Location $FrontendDir
    npm run dev -- --host 0.0.0.0 --port 5173
} -ArgumentList $FrontendDir

Write-Log "Both services are starting."
Write-Log "Open http://localhost:5173 in your browser."
Write-Log "Press Ctrl+C to stop both jobs."

try {
    while ($true) {
        Start-Sleep -Seconds 2

        $backendState = (Get-Job -Id $backendJob.Id).State
        $frontendState = (Get-Job -Id $frontendJob.Id).State

        if ($backendState -eq "Failed" -or $frontendState -eq "Failed") {
            Write-Log "One of the services exited with an error. Showing logs..."
            Receive-Job -Job $backendJob -Keep -ErrorAction SilentlyContinue
            Receive-Job -Job $frontendJob -Keep -ErrorAction SilentlyContinue
            throw "Service startup failed."
        }

        Receive-Job -Job $backendJob -Keep -ErrorAction SilentlyContinue
        Receive-Job -Job $frontendJob -Keep -ErrorAction SilentlyContinue
    }
}
finally {
    Stop-Services
}
