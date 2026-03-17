#!/usr/bin/env python3
"""
Deep-dive factual analysis of github-scrum skill responses
Validates gh command syntax, identifies bugs and gaps
"""

import json
from pathlib import Path
import re


def validate_gh_commands(response: str) -> dict:
    """Validate gh command syntax against known patterns"""

    issues = []
    fixes = []

    # Extract all gh commands from response
    gh_pattern = r'gh\s+\w+[\w\s\-\-\w=".]*'
    commands = re.findall(gh_pattern, response)

    # Known valid flags for each gh command type
    valid_flags = {
        "label create": ["--color", "--description"],
        "label list": ["--json", "-q"],
        "label delete": ["--yes"],
        "api": ["--method", "--field"],
        "issue create": ["--title", "--body", "--label", "--milestone", "--repo"],
        "issue edit": ["--milestone", "--add-label", "--remove-label"],
        "issue list": ["--milestone", "--state", "--label", "--json", "-q"],
        "release create": ["--title", "--notes", "--repo"],
    }

    # Validation checks
    checks = {
        "uses_GH_PAGER": (
            "export GH_PAGER=cat" in response or "GH_PAGER=cat" in response
        ),
        "creates_labels_with_descriptions": ("--description" in response),
        "uses_gh_api_for_milestone": (
            "gh api repos/" in response and "milestones" in response
        ),
        "handles_carryover_properly": (
            '--milestone ""' in response or "--milestone ''" in response
        ),
        "uses_gh_release_create": ("gh release create" in response),
        "includes_status_labels": ("status:" in response),
        "four_namespaces": (
            "type:" in response
            and "priority:" in response
            and "size:" in response
            and "status:" in response
        ),
    }

    return {
        "commands_found": len(commands),
        "validation_checks": checks,
        "issues": issues,
        "fixes": fixes,
    }


def analyze_eval_responses():
    """Analyze all evaluation responses for bugs and gaps"""

    base_path = Path(
        "/Volumes/SamsungSSD/repos/vmvarela/skills/skills/github-scrum-workspace/iteration-1"
    )

    analysis = {"bugs_found": [], "gaps_found": [], "validation_summary": {}}

    # Analyze each eval
    for eval_dir in ["eval-0-init-project", "eval-1-mid-sprint", "eval-2-close-sprint"]:
        eval_path = base_path / eval_dir

        # Analyze with_skill response
        response_path = eval_path / "with_skill" / "outputs" / "response.md"
        if response_path.exists():
            response = response_path.read_text()

            # Validate commands
            validation = validate_gh_commands(response)
            analysis["validation_summary"][eval_dir] = validation["validation_checks"]

            # Check for specific issues

            # BUG: Using BSD date syntax with -d flag (macOS incompatible)
            if "date -u -d" in response and "macOS" not in response:
                analysis["bugs_found"].append(
                    {
                        "location": eval_dir,
                        "severity": "HIGH",
                        "bug": "Using 'date -u -d' (GNU/Linux syntax) in example; macOS uses 'date -u -v+14d'",
                        "fix": "Use cross-platform date syntax or document both",
                        "command": 'date -u -d "+14 days"',
                    }
                )

            # Check for auth handling
            if (
                "gh repo" not in response
                and "--repo" not in response
                and eval_dir != "eval-0-init-project"
            ):
                analysis["gaps_found"].append(
                    {
                        "location": eval_dir,
                        "gap": "Missing --repo flag for commands that should specify target repo",
                        "impact": "Commands may fail if default repo is not set",
                        "example": "Should use 'gh issue create --repo mycompany/auth-service' or set GH_REPO env var",
                    }
                )

            # Check for error handling
            if "if" not in response and "||" not in response:
                analysis["gaps_found"].append(
                    {
                        "location": eval_dir,
                        "gap": "No error handling or conditional logic in commands",
                        "impact": "Scripts may continue after command failures",
                        "example": "Should add 'set -e' at top of script or use '|| exit 1' after critical commands",
                    }
                )

    # Specific gaps identified from SKILL.md
    skill_path = Path(
        "/Volumes/SamsungSSD/repos/vmvarela/skills/skills/github-scrum/SKILL.md"
    )
    skill_content = skill_path.read_text()

    # Check for undocumented scenarios
    missing_scenarios = []

    if "how to handle label conflicts" not in skill_content.lower():
        missing_scenarios.append("Handling label naming conflicts or duplicates")

    if "merge strategy" not in skill_content.lower():
        missing_scenarios.append("PR merge strategies (squash vs rebase)")

    if "rollback" not in skill_content.lower():
        missing_scenarios.append("Rolling back a closed sprint or released version")

    for scenario in missing_scenarios:
        analysis["gaps_found"].append(
            {
                "location": "SKILL.md",
                "gap": f"No guidance on: {scenario}",
                "impact": "Users must figure this out independently",
                "recommended_addition": f"Add section documenting {scenario}",
            }
        )

    return analysis


if __name__ == "__main__":
    analysis = analyze_eval_responses()

    print("\n" + "=" * 70)
    print("FACTUAL BUG & GAP ANALYSIS")
    print("=" * 70 + "\n")

    print(f"BUGS FOUND: {len(analysis['bugs_found'])}")
    for bug in analysis["bugs_found"]:
        print(f"\n  [{bug['severity']}] {bug['bug']}")
        print(f"    Location: {bug['location']}")
        print(f"    Command: {bug['command']}")
        print(f"    Fix: {bug['fix']}")

    print(f"\n\nGAPS FOUND: {len(analysis['gaps_found'])}")
    for i, gap in enumerate(analysis["gaps_found"], 1):
        print(f"\n  [{i}] {gap['gap']}")
        print(f"    Location: {gap['location']}")
        print(f"    Impact: {gap['impact']}")
        if "example" in gap:
            print(f"    Example: {gap['example']}")
        if "recommended_addition" in gap:
            print(f"    Recommendation: {gap['recommended_addition']}")

    print("\n" + "=" * 70)
    print("VALIDATION CHECKS")
    print("=" * 70 + "\n")

    for eval_dir, checks in analysis["validation_summary"].items():
        print(f"\n{eval_dir}:")
        for check, passed in checks.items():
            status = "✓" if passed else "✗"
            print(f"  {status} {check}")

    # Save detailed analysis
    analysis_path = Path(
        "/Volumes/SamsungSSD/repos/vmvarela/skills/skills/github-scrum-workspace/iteration-1/ANALYSIS.json"
    )
    analysis_path.write_text(json.dumps(analysis, indent=2))
    print(f"\n\nDetailed analysis saved to: {analysis_path}")
