import { Issue } from './github.js';

export interface DoRCheck {
  id: string;
  check: (issue: Issue) => boolean;
  message: string;
  required: boolean;
}

export interface DoRResult {
  passed: boolean;
  checks: Array<{
    id: string;
    passed: boolean;
    message: string;
    required: boolean;
  }>;
  requiredPassed: number;
  requiredTotal: number;
}

export const DoR_CHECKS: DoRCheck[] = [
  {
    id: 'description',
    check: (issue) => issue.body.length >= 50,
    message: 'Add a clear description (minimum 50 characters)',
    required: true,
  },
  {
    id: 'acceptance_criteria',
    check: (issue) => issue.body.includes('- [ ]') || issue.body.includes('- [x]'),
    message: 'Add acceptance criteria as a checklist (`- [ ] criterion`)',
    required: true,
  },
  {
    id: 'size_estimate',
    check: (issue) => issue.labels.some((l) => l.startsWith('size:')),
    message: 'Add a size estimate label (size:xs/s/m/l/xl)',
    required: true,
  },
  {
    id: 'type_label',
    check: (issue) => issue.labels.some((l) => l.startsWith('type:')),
    message: 'Add a type label (type:feature/bug/chore/spike/docs)',
    required: true,
  },
  {
    id: 'not_blocked',
    check: (issue) => !issue.labels.includes('status:blocked'),
    message: 'Issue is blocked - resolve blockers before adding to sprint',
    required: true,
  },
  {
    id: 'priority_label',
    check: (issue) => issue.labels.some((l) => l.startsWith('priority:')),
    message: 'Consider adding a priority label',
    required: false,
  },
];

export function validateDoR(issue: Issue): DoRResult {
  const checks = DoR_CHECKS.map((check) => ({
    id: check.id,
    passed: check.check(issue),
    message: check.message,
    required: check.required,
  }));

  const requiredChecks = checks.filter((c) => c.required);
  const requiredPassed = requiredChecks.filter((c) => c.passed).length;
  
  return {
    passed: requiredPassed === requiredChecks.length,
    checks,
    requiredPassed,
    requiredTotal: requiredChecks.length,
  };
}

export function generateDoRComment(result: DoRResult): string {
  const lines: string[] = [];
  
  if (result.passed) {
    lines.push('✅ **Definition of Ready - All checks passed!**');
    lines.push('');
    lines.push('This issue is ready to be added to a sprint.');
  } else {
    lines.push('⚠️ **Definition of Ready Check**');
    lines.push('');
    lines.push('This issue needs refinement before it can be added to a sprint:');
    lines.push('');
    lines.push('**Required:**');
    
    const requiredChecks = result.checks.filter((c) => c.required);
    for (const check of requiredChecks) {
      const icon = check.passed ? '✓' : '✗';
      lines.push(`- [${icon}] ${check.message}`);
    }
    
    const optionalChecks = result.checks.filter((c) => !c.required);
    if (optionalChecks.length > 0) {
      lines.push('');
      lines.push('**Optional:**');
      for (const check of optionalChecks) {
        const icon = check.passed ? '✓' : ' ';
        lines.push(`- [${icon}] ${check.message}`);
      }
    }
    
    lines.push('');
    lines.push(`**Progress:** ${result.requiredPassed}/${result.requiredTotal} required checks passed`);
    lines.push('');
    lines.push('Please address the missing items and re-apply `status:ready`.');
  }
  
  return lines.join('\n');
}

export function getSizeFromLabels(labels: string[]): string | null {
  const sizeLabel = labels.find((l) => l.startsWith('size:'));
  if (sizeLabel) {
    return sizeLabel.replace('size:', '').toUpperCase();
  }
  return null;
}

export function getTypeFromLabels(labels: string[]): string | null {
  const typeLabel = labels.find((l) => l.startsWith('type:'));
  if (typeLabel) {
    return typeLabel.replace('type:', '');
  }
  return null;
}

export function getPriorityFromLabels(labels: string[]): string | null {
  const priorityLabel = labels.find((l) => l.startsWith('priority:'));
  if (priorityLabel) {
    return priorityLabel.replace('priority:', '');
  }
  return null;
}
