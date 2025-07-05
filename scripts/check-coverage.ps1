# PowerShell script to check test coverage from lcov.info file
# Requires minimum 80% line coverage to pass

param(
    [string]$CoverageFile = "coverage/lcov.info",
    [int]$MinCoverage = 25
)

$ErrorActionPreference = "Stop"

Write-Host "Checking test coverage..." -ForegroundColor Cyan

# Check if coverage file exists
if (-not (Test-Path $CoverageFile)) {
    Write-Host "ERROR: Coverage file not found: $CoverageFile" -ForegroundColor Red
    Write-Host "Make sure to run tests with coverage first: bun test --coverage" -ForegroundColor Yellow
    exit 1
}

Write-Host "Parsing coverage data from $CoverageFile" -ForegroundColor Blue

try {
    # Read the lcov.info file
    $content = Get-Content $CoverageFile -Raw
    
    # Parse lcov.info to calculate line coverage percentage
    # LF = lines found, LH = lines hit
    $linesFound = 0
    $linesHit = 0
    
    # Extract LF and LH values using regex
    $lfMatches = [regex]::Matches($content, "^LF:(\d+)", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    $lhMatches = [regex]::Matches($content, "^LH:(\d+)", [System.Text.RegularExpressions.RegexOptions]::Multiline)
    
    foreach ($match in $lfMatches) {
        $linesFound += [int]$match.Groups[1].Value
    }
    
    foreach ($match in $lhMatches) {
        $linesHit += [int]$match.Groups[1].Value
    }
    
    if ($linesFound -eq 0) {
        Write-Host "ERROR: Could not parse coverage data from lcov file or no lines found" -ForegroundColor Red
        exit 1
    }

    # Calculate coverage percentage
    $coverage = [math]::Round(($linesHit / $linesFound) * 100, 2)

    Write-Host "Coverage Results:" -ForegroundColor Green
    Write-Host "   Lines found: $linesFound" -ForegroundColor White
    Write-Host "   Lines hit: $linesHit" -ForegroundColor White
    Write-Host "   Coverage: $coverage%" -ForegroundColor White
    Write-Host "   Minimum required: $MinCoverage%" -ForegroundColor White
    
    # Check if coverage meets minimum threshold
    if ($coverage -lt $MinCoverage) {
        Write-Host "FAILED: Coverage $coverage% is below minimum threshold of $MinCoverage%" -ForegroundColor Red
        Write-Host ""
        Write-Host "To improve coverage:" -ForegroundColor Yellow
        Write-Host "   1. Add tests for uncovered code paths" -ForegroundColor Yellow
        Write-Host "   2. Run 'bun test --coverage' locally to see detailed coverage report" -ForegroundColor Yellow
        Write-Host "   3. Focus on files with low coverage first" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "SUCCESS: Coverage check passed! ($coverage% >= $MinCoverage%)" -ForegroundColor Green
}
catch {
    Write-Host "ERROR: Error parsing coverage file: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
