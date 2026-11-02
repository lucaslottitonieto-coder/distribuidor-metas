$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22.18 ou mais recente antes de continuar.' }
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pythonLauncher) { & py -3 -m venv .venv }
    else {
        $runtimePython = Get-ChildItem -LiteralPath 'C:\Program Files\WindowsApps' -Directory -Filter 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'dependencies\python\python.exe' } |
            Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($runtimePython) { & $runtimePython -m venv .venv }
        else { & python -m venv .venv }
    }
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o ambiente Python. Instale Python 3.11 ou mais recente.' }
}
& $venvPython -m pip install -r backend/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha na instalação das dependências Python.' }
& npm.cmd install
if ($LASTEXITCODE -ne 0) { throw 'Falha na instalação das dependências do front-end.' }
Write-Host 'Configuração concluída. Abra iniciar.cmd para executar o sistema.' -ForegroundColor Green
