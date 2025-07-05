#!/bin/bash

# Script to check test coverage from lcov.info file
# Requires minimum 80% line coverage to pass

set -e

MIN_COVERAGE=25

echo "🔍 Checking test coverage..."

# Try multiple possible locations for coverage file
COVERAGE_FILE=""
if [ -f "coverage/lcov.info" ]; then
    COVERAGE_FILE="coverage/lcov.info"
    echo "📁 Found coverage file: coverage/lcov.info"
elif [ -f "lcov.info" ]; then
    COVERAGE_FILE="lcov.info"
    echo "📁 Found coverage file: lcov.info (root directory)"
elif [ -f "coverage.info" ]; then
    COVERAGE_FILE="coverage.info"
    echo "📁 Found coverage file: coverage.info"
else
    echo "❌ Coverage file not found in any expected location"
    echo "🔍 Searched locations:"
    echo "   - coverage/lcov.info"
    echo "   - lcov.info"
    echo "   - coverage.info"
    echo ""
    echo "📂 Current directory contents:"
    ls -la
    echo ""
    echo "📂 Coverage directory contents (if exists):"
    ls -la coverage/ 2>/dev/null || echo "   Coverage directory not found"
    echo ""
    echo "🔍 Looking for any .info files:"
    find . -name "*.info" -type f 2>/dev/null || echo "   No .info files found"
    echo ""
    echo "💡 Make sure to run tests with coverage first: bun test --coverage"
    exit 1
fi

echo "📊 Parsing coverage data from $COVERAGE_FILE"

# Parse lcov.info to calculate line coverage percentage
# LF = lines found, LH = lines hit
LINES_FOUND=$(grep -E "^LF:" "$COVERAGE_FILE" | cut -d: -f2 | awk '{sum += $1} END {print sum}')
LINES_HIT=$(grep -E "^LH:" "$COVERAGE_FILE" | cut -d: -f2 | awk '{sum += $1} END {print sum}')

if [ -z "$LINES_FOUND" ] || [ -z "$LINES_HIT" ] || [ "$LINES_FOUND" -eq 0 ]; then
    echo "❌ Could not parse coverage data from lcov file"
    exit 1
fi

# Calculate coverage percentage
COVERAGE=$(awk "BEGIN {printf \"%.2f\", ($LINES_HIT / $LINES_FOUND) * 100}")

echo "📈 Coverage Results:"
echo "   Lines found: $LINES_FOUND"
echo "   Lines hit: $LINES_HIT"
echo "   Coverage: $COVERAGE%"
echo "   Minimum required: $MIN_COVERAGE%"

# Check if coverage meets minimum threshold
if awk "BEGIN {exit !($COVERAGE < $MIN_COVERAGE)}"; then
    echo "❌ Coverage $COVERAGE% is below minimum threshold of $MIN_COVERAGE%"
    echo ""
    echo "💡 To improve coverage:"
    echo "   1. Add tests for uncovered code paths"
    echo "   2. Run 'bun test --coverage' locally to see detailed coverage report"
    echo "   3. Focus on files with low coverage first"
    exit 1
fi

echo "✅ Coverage check passed! ($COVERAGE% >= $MIN_COVERAGE%)"
