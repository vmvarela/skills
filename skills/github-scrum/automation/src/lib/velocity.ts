import { ProjectItem } from './project.js';

export interface VelocityMetrics {
  sprint: string;
  planned: { issues: number; points: number };
  completed: { issues: number; points: number };
  carryover: { issues: number; points: number };
  goalMet: boolean;
}

const SIZE_TO_POINTS: Record<string, number> = {
  'XS': 1,
  'S': 2,
  'M': 4,
  'L': 8,
  'XL': 16,
};

export function calculatePoints(items: ProjectItem[]): number {
  return items.reduce((total, item) => {
    const size = item.fieldValues['Size'] as string;
    if (size) {
      return total + (SIZE_TO_POINTS[size.toUpperCase()] || 0);
    }
    return total;
  }, 0);
}

export function calculateVelocity(
  items: ProjectItem[],
  sprintName: string,
  goalMet: boolean
): VelocityMetrics {
  const completedItems = items.filter((item) => item.fieldValues['Status'] === 'Done');
  const carryoverItems = items.filter((item) => item.fieldValues['Status'] !== 'Done');

  return {
    sprint: sprintName,
    planned: {
      issues: items.length,
      points: calculatePoints(items),
    },
    completed: {
      issues: completedItems.length,
      points: calculatePoints(completedItems),
    },
    carryover: {
      issues: carryoverItems.length,
      points: calculatePoints(carryoverItems),
    },
    goalMet,
  };
}

export function generateVelocityReport(sprints: VelocityMetrics[]): string {
  const lines: string[] = [];
  
  lines.push('## Velocity Report');
  lines.push('');
  lines.push('```');
  lines.push('Velocity Trend (Last ' + sprints.length + ' Sprints)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('Sprint    │ Issues    │ Points    │ Goal Met');
  lines.push('──────────┼───────────┼───────────┼──────────');
  
  for (const sprint of sprints) {
    const issuesStr = `${sprint.completed.issues}/${sprint.planned.issues}`.padEnd(9);
    const pointsStr = `${sprint.completed.points}/${sprint.planned.points}`.padEnd(9);
    const goalStr = sprint.goalMet ? '✓' : '✗';
    lines.push(`${sprint.sprint.padEnd(9)} │ ${issuesStr} │ ${pointsStr} │ ${goalStr}`);
  }
  
  lines.push('```');
  lines.push('');
  
  // Calculate averages
  const totalCompleted = sprints.reduce((sum, s) => sum + s.completed.points, 0);
  const avgVelocity = Math.round(totalCompleted / sprints.length);
  const completionRate = Math.round(
    (sprints.reduce((sum, s) => sum + s.completed.issues, 0) / 
     sprints.reduce((sum, s) => sum + s.planned.issues, 0)) * 100
  );
  const goalsMet = sprints.filter((s) => s.goalMet).length;
  
  lines.push('### Summary');
  lines.push('');
  lines.push(`- **Average Velocity:** ${avgVelocity} points/sprint`);
  lines.push(`- **Completion Rate:** ${completionRate}%`);
  lines.push(`- **Goals Met:** ${goalsMet}/${sprints.length} sprints`);
  lines.push('');
  lines.push('### Recommendation');
  lines.push('');
  
  if (avgVelocity > 0) {
    lines.push(`Based on your velocity, plan sprints with approximately **${avgVelocity} points** of work.`);
  } else {
    lines.push('Not enough data to make recommendations. Complete more sprints to establish velocity trends.');
  }
  
  return lines.join('\n');
}

export function generateSprintSummary(
  metrics: VelocityMetrics,
  sprintGoal: string
): string {
  const lines: string[] = [];
  
  lines.push(`## Sprint Summary: ${metrics.sprint}`);
  lines.push('');
  lines.push(`**Sprint Goal:** ${sprintGoal || 'Not set'}`);
  lines.push('');
  lines.push('### Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Planned Issues | ${metrics.planned.issues} (${metrics.planned.points} pts) |`);
  lines.push(`| Completed Issues | ${metrics.completed.issues} (${metrics.completed.points} pts) |`);
  lines.push(`| Carryover Issues | ${metrics.carryover.issues} (${metrics.carryover.points} pts) |`);
  lines.push(`| Completion Rate | ${Math.round((metrics.completed.issues / metrics.planned.issues) * 100)}% |`);
  lines.push(`| Sprint Goal Met | ${metrics.goalMet ? '✅ Yes' : '❌ No'} |`);
  lines.push('');
  
  if (metrics.carryover.issues > 0) {
    lines.push('### Carryover');
    lines.push('');
    lines.push(`${metrics.carryover.issues} issue(s) will be moved to the next sprint or backlog.`);
  }
  
  return lines.join('\n');
}
