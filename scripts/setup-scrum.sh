#!/bin/bash
# GitHub Scrum Project Setup Script
# Run this after creating the project to configure all custom fields

set -e

echo "🚀 GitHub Scrum Project Setup"
echo "=============================="
echo ""

# Check authentication
if ! gh auth status &>/dev/null; then
    echo "❌ Not authenticated. Run: gh auth login"
    exit 1
fi

# Check project scopes
if ! gh project list --owner vmvarela &>/dev/null; then
    echo "⚠️  Missing project scopes. Run: gh auth refresh -s project,read:project"
    exit 1
fi

# Get project info
echo "📋 Available projects:"
gh project list --owner vmvarela
echo ""

read -p "Enter project number (e.g., 5): " PROJECT_NUM

if [ -z "$PROJECT_NUM" ]; then
    echo "❌ Project number required"
    exit 1
fi

echo ""
echo "🔧 Configuring Project #$PROJECT_NUM..."
echo ""

# Get project details
PROJECT_URL="https://github.com/users/vmvarela/projects/$PROJECT_NUM"
echo "Project URL: $PROJECT_URL"
echo ""

# Import all open issues
echo "📥 Importing open issues to project..."
ISSUE_COUNT=0
for url in $(gh issue list --state open --json url --jq '.[].url'); do
    echo "  Adding: $url"
    gh project item-add "$PROJECT_NUM" --owner vmvarela --url "$url" 2>/dev/null || true
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
done

echo ""
echo "✅ Imported $ISSUE_COUNT issues"
echo ""

# Pin Product Goal issue if exists
echo "📌 Pinning Product Goal issue..."
PRODUCT_GOAL=$(gh issue list --search "Product Goal" --state open --json number --jq '.[0].number')
if [ -n "$PRODUCT_GOAL" ]; then
    gh issue pin "$PRODUCT_GOAL" 2>/dev/null || echo "  Issue #$PRODUCT_GOAL already pinned or not found"
fi

echo ""
echo "✅ Project setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Visit: $PROJECT_URL/settings/fields"
echo ""
echo "2. Add these custom fields:"
echo ""
echo "   Status (Single Select):"
echo "   - Backlog (Gray)"
echo "   - Ready (Green)"
echo "   - In Progress (Blue)"
echo "   - Blocked (Red)"
echo "   - Review (Purple)"
echo "   - Done (Green)"
echo ""
echo "   Size (Single Select):"
echo "   - XS - Less than 1 hour (Gray)"
echo "   - S - 1-4 hours (Blue)"
echo "   - M - 4-8 hours (Yellow)"
echo "   - L - 1-2 days (Orange)"
echo "   - XL - More than 2 days (Red)"
echo ""
echo "   Priority (Single Select):"
echo "   - Critical (Red)"
echo "   - High (Orange)"
echo "   - Medium (Yellow)"
echo "   - Low (Gray)"
echo ""
echo "   Type (Single Select):"
echo "   - Feature (Blue)"
echo "   - Bug (Red)"
echo "   - Chore (Gray)"
echo "   - Spike (Purple)"
echo "   - Docs (Blue)"
echo ""
echo "   Sprint (Iteration):"
echo "   - Configure 14-day duration"
echo "   - Set start date to next Monday"
echo ""
echo "   Sprint Goal (Text):"
echo "   - Single line text field"
echo ""
echo "   Estimate (Number):"
echo "   - Number field for story points"
echo ""
echo "3. Set field values for each issue based on their labels"
echo ""
echo "4. Create views:"
echo "   - Board (grouped by Status)"
echo "   - Sprint (filtered by current Sprint)"
echo "   - Backlog (Status=Backlog, sorted by Priority)"
echo "   - Velocity (grouped by Sprint)"
echo ""
echo "5. Start your first sprint:"
echo "   gh workflow run sprint-start.yml"
echo ""
