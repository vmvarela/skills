#!/usr/bin/env python3
"""
Skill eval grader.

Usage:
  python evals/grader.py \
    --skill github-scrum \
    --response-file /tmp/response.txt \
    --eval-id 0 \
    --output /tmp/grading.json

  python evals/grader.py \
    --skill github-scrum \
    --aggregate \
    --results-dir /tmp/results \
    --baseline skills/github-scrum-workspace/iteration-1/benchmark.json \
    --output /tmp/summary.json \
    --delta-threshold 5
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Static graders
# ---------------------------------------------------------------------------


def grade_static(assertion_id: str, assertion_text: str, response: str) -> dict | None:
    """
    Grade assertions that can be evaluated without an LLM.
    Returns {"passed": bool, "reason": str} or None if not statically gradeable.
    """
    text_lower = assertion_text.lower()
    resp_lower = response.lower()

    # --- Line count assertions ---
    m = re.search(r"under[- ](\d+)[- ]lines?", text_lower)
    if m:
        limit = int(m.group(1))
        count = len(response.strip().splitlines())
        passed = count < limit
        return {
            "passed": passed,
            "reason": f"Response has {count} lines ({'under' if passed else 'over'} the {limit}-line limit).",
        }

    # --- "shorter than original" ---
    m = re.search(r"shorter than.*?~?(\d+)[- ]lines?", text_lower)
    if m:
        limit = int(m.group(1))
        count = len(response.strip().splitlines())
        passed = count < limit
        return {
            "passed": passed,
            "reason": f"Response has {count} lines ({'shorter' if passed else 'longer'} than original ~{limit} lines).",
        }

    # --- "does not start with 'Welcome to'" ---
    if "welcome to" in text_lower and (
        "does not start" in text_lower or "not start" in text_lower
    ):
        first_line = (
            response.strip().splitlines()[0].lower() if response.strip() else ""
        )
        # Check first ~200 chars for welcome phrases
        first_chunk = response.strip()[:200].lower()
        bad_phrases = ["welcome to", "welcome!", "introducing "]
        passed = not any(p in first_chunk for p in bad_phrases)
        return {
            "passed": passed,
            "reason": (
                "No welcome/filler opener detected."
                if passed
                else "Response starts with a welcome/filler phrase."
            ),
        }

    # --- Keyword presence assertions (gh CLI commands, API paths, etc.) ---
    # "GH_PAGER=cat"
    if "gh_pager" in text_lower or "gh_pager=cat" in text_lower:
        passed = "GH_PAGER=cat" in response
        return {
            "passed": passed,
            "reason": (
                "GH_PAGER=cat found in response."
                if passed
                else "GH_PAGER=cat not found in response."
            ),
        }

    # "gh issue create" present
    if "gh issue create" in text_lower:
        passed = "gh issue create" in resp_lower
        return {
            "passed": passed,
            "reason": (
                "gh issue create command found."
                if passed
                else "gh issue create command not found."
            ),
        }

    # "gh release create" present
    if "gh release create" in text_lower:
        passed = "gh release create" in resp_lower
        return {
            "passed": passed,
            "reason": (
                "gh release create command found."
                if passed
                else "gh release create command not found."
            ),
        }

    # "gh api" with milestones POST
    if "gh api" in text_lower and "milestones" in text_lower and "post" in text_lower:
        passed = (
            "gh api" in resp_lower
            and "milestones" in resp_lower
            and ("--method post" in resp_lower or "--method POST" in response)
        )
        return {
            "passed": passed,
            "reason": (
                "gh api milestones --method POST found."
                if passed
                else "gh api milestones --method POST not found."
            ),
        }

    # curl POST to specific JIRA endpoints
    if "/rest/agile/1.0/sprint" in assertion_text and "POST" in assertion_text:
        passed = "/rest/agile/1.0/sprint" in response and (
            "POST" in response or "post" in resp_lower
        )
        return {
            "passed": passed,
            "reason": (
                "Correct Agile sprint endpoint with POST found."
                if passed
                else "Agile sprint POST endpoint not found."
            ),
        }

    if "/rest/api/3/issue" in assertion_text and "POST" in assertion_text:
        passed = "/rest/api/3/issue" in response and (
            "POST" in response or "-X POST" in response
        )
        return {
            "passed": passed,
            "reason": (
                "Issue creation via POST /rest/api/3/issue found."
                if passed
                else "POST /rest/api/3/issue not found."
            ),
        }

    if (
        "DELETE /rest/api/3/issueLink" in assertion_text
        or "delete.*issuelink" in text_lower
    ):
        passed = "/rest/api/3/issueLink" in response and (
            "DELETE" in response or "-X DELETE" in response
        )
        return {
            "passed": passed,
            "reason": (
                "DELETE issueLink endpoint found."
                if passed
                else "DELETE issueLink not found."
            ),
        }

    if (
        "/rest/agile/1.0/sprint" in assertion_text
        and "PUT" in assertion_text
        and "closed" in assertion_text
    ):
        passed = "/rest/agile/1.0/sprint" in response and (
            "PUT" in response or "-X PUT" in response
        )
        return {
            "passed": passed,
            "reason": (
                "Sprint closure via PUT found."
                if passed
                else "Sprint closure via PUT not found."
            ),
        }

    # "implementation is in Python"
    if "language is python" in assertion_id or (
        "python" in text_lower and "implementation" in text_lower
    ):
        passed = "```python" in response or "def " in response
        return {
            "passed": passed,
            "reason": (
                "Python code block found in response."
                if passed
                else "No Python code block found."
            ),
        }

    # "pip install" or "go install" present
    if "installation" in assertion_id or "install" in text_lower:
        passed = (
            "pip install" in response
            or "go install" in response
            or "npm install" in response
            or "brew install" in response
            or "apt install" in response
            or "## installation" in resp_lower
            or "## install" in resp_lower
        )
        return {
            "passed": passed,
            "reason": (
                "Installation instructions found."
                if passed
                else "No installation instructions found."
            ),
        }

    # Not statically gradeable
    return None


# ---------------------------------------------------------------------------
# Result aggregation
# ---------------------------------------------------------------------------


def load_eval_file(skill: str, evals_dir: Path) -> dict:
    """Load the evals JSON for a given skill."""
    # Try skill-specific file first, then fall back to evals.json
    candidates = [
        evals_dir / f"{skill}-evals.json",
        evals_dir / "evals.json",
    ]
    for path in candidates:
        if path.exists():
            data = json.loads(path.read_text())
            if data.get("skill_name") == skill or path.name == f"{skill}-evals.json":
                return data
    raise FileNotFoundError(f"No eval file found for skill '{skill}' in {evals_dir}")


def grade_response(skill: str, eval_id: int, response: str, evals_dir: Path) -> dict:
    """
    Grade a single response against the assertions for eval_id.
    Returns a grading dict with per-assertion results and summary counts.
    Static assertions are graded here; LLM assertions are marked pending.
    """
    data = load_eval_file(skill, evals_dir)
    eval_def = next((e for e in data["evals"] if e["id"] == eval_id), None)
    if not eval_def:
        raise ValueError(f"Eval {eval_id} not found for skill '{skill}'")

    results = []
    pending_llm = []

    for assertion in eval_def["assertions"]:
        atype = assertion.get("type", "llm")  # default to llm if not specified
        aid = assertion["id"]
        atext = assertion["text"]

        if atype == "static":
            grade = grade_static(aid, atext, response)
            if grade is None:
                # Static classification but couldn't auto-grade — fall through to LLM
                pending_llm.append(assertion)
                results.append(
                    {
                        "id": aid,
                        "type": "static",
                        "status": "pending_llm",
                        "passed": None,
                        "reason": "",
                    }
                )
            else:
                results.append(
                    {"id": aid, "type": "static", "status": "graded", **grade}
                )
        else:
            pending_llm.append(assertion)
            results.append(
                {
                    "id": aid,
                    "type": "llm",
                    "status": "pending_llm",
                    "passed": None,
                    "reason": "",
                }
            )

    static_graded = [r for r in results if r["status"] == "graded"]
    static_passed = sum(1 for r in static_graded if r["passed"])

    return {
        "skill": skill,
        "eval_id": eval_id,
        "prompt": eval_def["prompt"],
        "assertions": results,
        "static_summary": {
            "graded": len(static_graded),
            "passed": static_passed,
        },
        "pending_llm_assertions": [a["id"] for a in pending_llm],
    }


def apply_llm_grades(grading: dict, llm_results: dict) -> dict:
    """
    Merge LLM grading results into a grading dict.
    llm_results: {assertion_id: {"passed": bool, "reason": str}}
    """
    for result in grading["assertions"]:
        if result["status"] == "pending_llm" and result["id"] in llm_results:
            llm = llm_results[result["id"]]
            result["passed"] = llm["passed"]
            result["reason"] = llm.get("reason", "")
            result["status"] = "graded"
    return grading


def finalize_grading(grading: dict) -> dict:
    """Compute final pass counts after all assertions are graded."""
    assertions = grading["assertions"]
    graded = [
        a for a in assertions if a["status"] == "graded" and a["passed"] is not None
    ]
    passed = sum(1 for a in graded if a["passed"])
    total = len(assertions)

    grading["summary"] = {
        "passed": passed,
        "total": total,
        "pass_rate": round(passed / total, 4) if total > 0 else 0.0,
        "ungraded": total - len(graded),
    }
    return grading


def aggregate_results(
    skill: str,
    eval_gradings: list,
    baseline_path: Path | None,
    delta_threshold: float = 5.0,
) -> dict:
    """
    Aggregate per-eval grading results and compare to baseline.
    Returns summary dict with regression status.
    """
    runs = []
    for g in eval_gradings:
        summary = g.get("summary", {})
        runs.append(
            {
                "eval_id": g["eval_id"],
                "passed": summary.get("passed", 0),
                "total": summary.get("total", 0),
                "pass_rate": summary.get("pass_rate", 0.0),
            }
        )

    total_passed = sum(r["passed"] for r in runs)
    total_assertions = sum(r["total"] for r in runs)
    overall_pass_rate = (
        round(total_passed / total_assertions, 4) if total_assertions > 0 else 0.0
    )

    result = {
        "skill": skill,
        "runs": runs,
        "overall": {
            "passed": total_passed,
            "total": total_assertions,
            "pass_rate": overall_pass_rate,
            "pass_rate_pct": round(overall_pass_rate * 100, 1),
        },
        "regression": {
            "status": "no_baseline",
            "baseline_pass_rate": None,
            "delta_pct": None,
            "threshold_pct": delta_threshold,
            "failed": False,
        },
    }

    # Compare to baseline
    if baseline_path and baseline_path.exists():
        baseline = json.loads(baseline_path.read_text())
        # Support both benchmark.json formats
        baseline_rate = None
        if "run_summary" in baseline:
            ws = baseline["run_summary"].get("with_skill", {})
            baseline_rate = ws.get("pass_rate", {}).get("mean")
        elif "overall" in baseline:
            baseline_rate = baseline["overall"].get("pass_rate")

        if baseline_rate is not None:
            # Normalize to 0-100 scale
            if baseline_rate <= 1.0:
                baseline_rate_pct = baseline_rate * 100
            else:
                baseline_rate_pct = baseline_rate

            current_pct = overall_pass_rate * 100
            delta = round(current_pct - baseline_rate_pct, 1)
            failed = delta < -delta_threshold

            result["regression"] = {
                "status": "regression" if failed else "ok",
                "baseline_pass_rate_pct": round(baseline_rate_pct, 1),
                "current_pass_rate_pct": round(current_pct, 1),
                "delta_pct": delta,
                "threshold_pct": delta_threshold,
                "failed": failed,
            }

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Grade skill eval responses")
    parser.add_argument("--skill", required=True, help="Skill name (e.g. github-scrum)")
    parser.add_argument(
        "--evals-dir", default="evals", help="Directory containing *-evals.json files"
    )
    parser.add_argument("--output", required=True, help="Output JSON file path")

    subparsers = parser.add_subparsers(dest="command")

    # grade: grade a single response
    grade_parser = subparsers.add_parser("grade", help="Grade a single response")
    grade_parser.add_argument("--eval-id", type=int, required=True)
    grade_parser.add_argument(
        "--response-file", required=True, help="File containing the LLM response"
    )
    grade_parser.add_argument(
        "--llm-grades-file", help="JSON file with LLM grading results to merge in"
    )

    # aggregate: combine per-eval results into summary
    agg_parser = subparsers.add_parser("aggregate", help="Aggregate eval results")
    agg_parser.add_argument(
        "--results-dir",
        required=True,
        help="Directory with per-eval grading JSON files",
    )
    agg_parser.add_argument("--baseline", help="Path to baseline benchmark.json")
    agg_parser.add_argument(
        "--delta-threshold",
        type=float,
        default=5.0,
        help="Max allowed pass rate drop in percentage points (default: 5)",
    )

    args = parser.parse_args()
    evals_dir = Path(args.evals_dir)

    if args.command == "grade":
        response = Path(args.response_file).read_text()
        grading = grade_response(args.skill, args.eval_id, response, evals_dir)

        if args.llm_grades_file:
            llm_results = json.loads(Path(args.llm_grades_file).read_text())
            grading = apply_llm_grades(grading, llm_results)

        grading = finalize_grading(grading)
        Path(args.output).write_text(json.dumps(grading, indent=2))
        print(f"Grading saved to {args.output}")
        summary = grading.get("summary", {})
        print(
            f"Result: {summary.get('passed')}/{summary.get('total')} passed "
            f"({summary.get('pass_rate', 0) * 100:.0f}%)"
        )

    elif args.command == "aggregate":
        results_dir = Path(args.results_dir)
        gradings = []
        for f in sorted(results_dir.glob("eval-*.json")):
            gradings.append(json.loads(f.read_text()))

        baseline_path = Path(args.baseline) if args.baseline else None
        summary = aggregate_results(
            args.skill, gradings, baseline_path, args.delta_threshold
        )
        Path(args.output).write_text(json.dumps(summary, indent=2))

        reg = summary["regression"]
        overall = summary["overall"]
        print(f"Skill: {args.skill}")
        print(
            f"Overall: {overall['passed']}/{overall['total']} ({overall['pass_rate_pct']}%)"
        )
        if reg["status"] == "ok":
            print(
                f"Regression check: OK (delta: {reg['delta_pct']:+.1f}pp vs baseline {reg['baseline_pass_rate_pct']}%)"
            )
        elif reg["status"] == "regression":
            print(
                f"REGRESSION DETECTED: {reg['delta_pct']:+.1f}pp vs baseline {reg['baseline_pass_rate_pct']}%",
                file=sys.stderr,
            )
            sys.exit(1)
        else:
            print("No baseline available for comparison.")

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
