import * as core from '@actions/core';
import { GitHubClient } from '../lib/github.js';
import { ProjectClient } from '../lib/project.js';
import { validateDoR, generateDoRComment } from '../lib/dor.js';
import { generateSprintStartSummary } from '../lib/sprint.js';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const owner = process.env.REPO_OWNER || '';
    const repo = process.env.REPO_NAME || '';
    const sprintGoal = process.env.SPRINT_GOAL || '';
    const sprintDays = parseInt(process.env.SPRINT_DAYS || '14', 10);

    if (!token || !owner || !repo) {
      throw new Error('Missing required environment variables');
    }

    core.info(`Starting sprint for ${owner}/${repo}`);
    core.info(`Goal: ${sprintGoal || 'Not set'}`);
    core.info(`Duration: ${sprintDays} days`);

    const github = new GitHubClient(token, owner, repo);
    const projectClient = new ProjectClient(token);

    // Find Scrum Board project
    const project = await projectClient.findProject(owner, 'Scrum Board');
    if (!project) {
      throw new Error('Scrum Board project not found. Run project-setup first.');
    }

    core.info(`Found project: ${project.title} (#${project.number})`);

    // Get project items
    const items = await projectClient.getProjectItems(project.id);
    core.info(`Found ${items.length} items in project`);

    // Get fields
    const fields = await projectClient.getProjectFields(project.id);
    const statusField = fields.find((f) => f.name === 'Status');
    const sprintGoalField = fields.find((f) => f.name === 'Sprint Goal');

    if (!statusField) {
      throw new Error('Status field not found in project');
    }

    // Find "Ready" and "Needs Refinement" options
    const readyOption = statusField.options?.find((o) => o.name === 'Ready');
    const needsRefinementOption = statusField.options?.find((o) => o.name === 'Needs Refinement');

    // Track DoR results
    let passedDoR = 0;
    let failedDoR = 0;

    // Process each item in sprint
    for (const item of items) {
      if (!item.content?.number) continue;

      core.info(`Processing issue #${item.content.number}: ${item.content.title}`);

      try {
        // Get full issue details
        const issue = await github.getIssue(item.content.number);

        // Validate DoR
        const dorResult = validateDoR(issue);

        if (dorResult.passed) {
          passedDoR++;
          core.info(`  ✓ DoR passed`);

          // Set Status = Ready
          if (readyOption) {
            await projectClient.updateItemField(
              project.id,
              item.id,
              statusField.id,
              readyOption.id
            );
          }
        } else {
          failedDoR++;
          core.info(`  ✗ DoR failed: ${dorResult.requiredPassed}/${dorResult.requiredTotal} checks`);

          // Set Status = Needs Refinement
          if (needsRefinementOption) {
            await projectClient.updateItemField(
              project.id,
              item.id,
              statusField.id,
              needsRefinementOption.id
            );
          }

          // Comment on issue
          const comment = generateDoRComment(dorResult);
          await github.addComment(issue.number, comment);
        }
      } catch (error) {
        core.warning(`Failed to process issue #${item.content.number}: ${error}`);
      }
    }

    // Calculate capacity
    const capacity = projectClient.calculateSprintCapacity(items);

    // Set Sprint Goal
    if (sprintGoal && sprintGoalField) {
      // Note: Setting text fields requires different API call
      core.info(`Setting sprint goal: ${sprintGoal}`);
    }

    // Generate summary
    const summary = generateSprintStartSummary(
      'Current Sprint',
      sprintGoal,
      capacity,
      items.length,
      passedDoR,
      failedDoR
    );

    core.info('\n' + summary);

    // Create summary comment in a tracking issue or as workflow output
    core.setOutput('summary', summary);
    core.setOutput('capacity', capacity.toString());
    core.setOutput('issues_processed', items.length.toString());
    core.setOutput('dor_passed', passedDoR.toString());
    core.setOutput('dor_failed', failedDoR.toString());

  } catch (error) {
    core.setFailed(`Sprint start failed: ${error}`);
  }
}

main();
