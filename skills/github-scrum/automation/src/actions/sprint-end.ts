import * as core from '@actions/core';
import { GitHubClient } from '../lib/github.js';
import { ProjectClient } from '../lib/project.js';
import { calculateVelocity, generateSprintSummary } from '../lib/velocity.js';
import { getCurrentSprint, isSprintEnded, generateRetrospectiveTemplate } from '../lib/sprint.js';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const owner = process.env.REPO_OWNER || '';
    const repo = process.env.REPO_NAME || '';

    if (!token || !owner || !repo) {
      throw new Error('Missing required environment variables');
    }

    core.info(`Checking sprint end for ${owner}/${repo}`);

    const github = new GitHubClient(token, owner, repo);
    const projectClient = new ProjectClient(token);

    // Find Scrum Board project
    const project = await projectClient.findProject(owner, 'Scrum Board');
    if (!project) {
      throw new Error('Scrum Board project not found');
    }

    // Get project items
    const items = await projectClient.getProjectItems(project.id);

    // Get current sprint
    const sprint = getCurrentSprint(items);
    if (!sprint) {
      core.info('No active sprint found');
      return;
    }

    core.info(`Found sprint: ${sprint.name}`);
    core.info(`End date: ${sprint.endDate.toISOString()}`);

    // Check if sprint ended
    if (!isSprintEnded(sprint)) {
      core.info('Sprint has not ended yet');
      core.info(`Days remaining: ${Math.ceil((sprint.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))}`);
      return;
    }

    core.info('Sprint has ended! Processing...');

    // Calculate velocity
    const metrics = calculateVelocity(items, sprint.name, sprint.goal ? true : false);

    core.info(`Planned: ${metrics.planned.issues} issues (${metrics.planned.points} pts)`);
    core.info(`Completed: ${metrics.completed.issues} issues (${metrics.completed.points} pts)`);
    core.info(`Carryover: ${metrics.carryover.issues} issues (${metrics.carryover.points} pts)`);

    // Generate summary
    const summary = generateSprintSummary(metrics, sprint.goal);
    core.info('\n' + summary);

    // Create retrospective issue
    const retroBody = generateRetrospectiveTemplate(sprint.name, sprint.goal, {
      planned: metrics.planned,
      completed: metrics.completed,
      carryover: metrics.carryover,
    });

    const retroNumber = await github.createIssue(
      `Retrospective: ${sprint.name}`,
      retroBody,
      ['retrospective']
    );

    core.info(`Created retrospective issue #${retroNumber}`);

    // Handle carryover
    const carryoverItems = items.filter((item) => item.fieldValues['Status'] !== 'Done');
    
    if (carryoverItems.length > 0) {
      core.info(`Processing ${carryoverItems.length} carryover items...`);

      const fields = await projectClient.getProjectFields(project.id);
      const statusField = fields.find((f) => f.name === 'Status');
      const backlogOption = statusField?.options?.find((o) => o.name === 'Backlog');

      for (const item of carryoverItems) {
        if (!item.content?.number) continue;

        core.info(`Moving issue #${item.content.number} to Backlog`);

        // Update status to Backlog
        if (statusField && backlogOption) {
          await projectClient.updateItemField(
            project.id,
            item.id,
            statusField.id,
            backlogOption.id
          );
        }

        // Remove status labels
        await github.updateIssueLabels(item.content.number, {
          remove: ['status:in-progress', 'status:blocked', 'status:review'],
        });

        // Add status:ready if it was ready before
        await github.updateIssueLabels(item.content.number, {
          add: ['status:ready'],
        });
      }
    }

    // Close completed issues
    const completedItems = items.filter((item) => item.fieldValues['Status'] === 'Done');
    for (const item of completedItems) {
      if (!item.content?.number) continue;

      // Remove all status labels
      await github.updateIssueLabels(item.content.number, {
        remove: ['status:ready', 'status:in-progress', 'status:blocked', 'status:review'],
      });
    }

    // Set outputs
    core.setOutput('sprint', sprint.name);
    core.setOutput('planned_issues', metrics.planned.issues.toString());
    core.setOutput('planned_points', metrics.planned.points.toString());
    core.setOutput('completed_issues', metrics.completed.issues.toString());
    core.setOutput('completed_points', metrics.completed.points.toString());
    core.setOutput('carryover_issues', metrics.carryover.issues.toString());
    core.setOutput('carryover_points', metrics.carryover.points.toString());
    core.setOutput('goal_met', metrics.goalMet.toString());
    core.setOutput('retrospective_issue', retroNumber.toString());

    core.info('Sprint end processing complete!');

  } catch (error) {
    core.setFailed(`Sprint end failed: ${error}`);
  }
}

main();
