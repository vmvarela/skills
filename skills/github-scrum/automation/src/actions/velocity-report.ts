import * as core from '@actions/core';
import { GitHubClient } from '../lib/github.js';
import { ProjectClient } from '../lib/project.js';
import { calculateVelocity, generateVelocityReport } from '../lib/velocity.js';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const owner = process.env.REPO_OWNER || '';
    const repo = process.env.REPO_NAME || '';
    const sprintCount = parseInt(process.env.SPRINT_COUNT || '6', 10);

    if (!token || !owner || !repo) {
      throw new Error('Missing required environment variables');
    }

    core.info(`Generating velocity report for ${owner}/${repo}`);
    core.info(`Including last ${sprintCount} sprints`);

    const github = new GitHubClient(token, owner, repo);
    const projectClient = new ProjectClient(token);

    // Find Scrum Board project
    const project = await projectClient.findProject(owner, 'Scrum Board');
    if (!project) {
      throw new Error('Scrum Board project not found');
    }

    // Get project items
    const items = await projectClient.getProjectItems(project.id);

    // Group items by sprint
    const sprintMap = new Map<string, typeof items>();
    
    for (const item of items) {
      const sprint = item.fieldValues['Sprint'] as string;
      if (sprint) {
        if (!sprintMap.has(sprint)) {
          sprintMap.set(sprint, []);
        }
        sprintMap.get(sprint)!.push(item);
      }
    }

    // Get unique sprints and sort by name (assuming sprint names are sequential)
    const sprints = Array.from(sprintMap.keys()).sort();
    
    // Take the last N sprints
    const recentSprints = sprints.slice(-sprintCount);

    core.info(`Found ${recentSprints.length} recent sprints`);

    // Calculate velocity for each sprint
    const metrics = recentSprints.map((sprintName) => {
      const sprintItems = sprintMap.get(sprintName) || [];
      
      // Check if sprint goal was met (simplified - assumes goal met if >80% completed)
      const completedCount = sprintItems.filter((i) => i.fieldValues['Status'] === 'Done').length;
      const goalMet = completedCount / sprintItems.length >= 0.8;

      return calculateVelocity(sprintItems, sprintName, goalMet);
    });

    // Generate report
    const report = generateVelocityReport(metrics);
    
    core.info('\n' + report);

    // Find or create velocity tracking issue
    const velocityIssueTitle = '📊 Velocity Tracking';
    
    // Search for existing velocity tracking issue
    const { data: issues } = await github['octokit'].rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      labels: 'type:docs',
    });

    const velocityIssue = issues.find((i) => i.title === velocityIssueTitle);

    if (velocityIssue) {
      // Update existing issue
      await github['octokit'].rest.issues.update({
        owner,
        repo,
        issue_number: velocityIssue.number,
        body: report,
      });
      core.info(`Updated velocity tracking issue #${velocityIssue.number}`);
    } else {
      // Create new tracking issue
      const issueNumber = await github.createIssue(
        velocityIssueTitle,
        report,
        ['type:docs']
      );
      core.info(`Created velocity tracking issue #${issueNumber}`);
    }

    // Calculate summary metrics
    const totalCompleted = metrics.reduce((sum, m) => sum + m.completed.points, 0);
    const avgVelocity = metrics.length > 0 ? Math.round(totalCompleted / metrics.length) : 0;
    const totalGoalsMet = metrics.filter((m) => m.goalMet).length;

    // Set outputs
    core.setOutput('report', report);
    core.setOutput('sprints_analyzed', metrics.length.toString());
    core.setOutput('average_velocity', avgVelocity.toString());
    core.setOutput('goals_met', totalGoalsMet.toString());

    core.info('\nVelocity report complete!');

  } catch (error) {
    core.setFailed(`Velocity report failed: ${error}`);
  }
}

main();
