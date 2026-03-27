import * as core from '@actions/core';
import { GitHubClient } from '../lib/github.js';
import { ProjectClient } from '../lib/project.js';
import { validateDoR, generateDoRComment } from '../lib/dor.js';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const owner = process.env.REPO_OWNER || '';
    const repo = process.env.REPO_NAME || '';
    const issueNumber = parseInt(process.env.ISSUE_NUMBER || '0', 10);
    const addedLabel = process.env.ISSUE_LABEL || '';

    if (!token || !owner || !repo || !issueNumber) {
      throw new Error('Missing required environment variables');
    }

    core.info(`Validating DoR for issue #${issueNumber}`);

    // Only validate when status:ready is added or on manual trigger
    if (addedLabel && addedLabel !== 'status:ready') {
      core.info(`Label "${addedLabel}" added - no DoR validation needed`);
      return;
    }

    const github = new GitHubClient(token, owner, repo);
    const projectClient = new ProjectClient(token);

    // Get issue details
    const issue = await github.getIssue(issueNumber);
    core.info(`Issue: ${issue.title}`);
    core.info(`Labels: ${issue.labels.join(', ')}`);

    // Validate DoR
    const dorResult = validateDoR(issue);

    core.info(`DoR Check: ${dorResult.requiredPassed}/${dorResult.requiredTotal} required checks passed`);

    // Find Scrum Board project
    const project = await projectClient.findProject(owner, 'Scrum Board');
    
    if (project) {
      // Get project fields
      const fields = await projectClient.getProjectFields(project.id);
      const statusField = fields.find((f) => f.name === 'Status');

      if (statusField) {
        // Find project item for this issue
        const items = await projectClient.getProjectItems(project.id);
        const projectItem = items.find((item) => item.content?.number === issueNumber);

        if (projectItem) {
          const readyOption = statusField.options?.find((o) => o.name === 'Ready');
          const needsRefinementOption = statusField.options?.find((o) => o.name === 'Needs Refinement');

          if (dorResult.passed) {
            // All checks passed - set Status = Ready
            core.info('DoR passed - setting Status to Ready');

            if (readyOption) {
              await projectClient.updateItemField(
                project.id,
                projectItem.id,
                statusField.id,
                readyOption.id
              );
            }

            // Ensure status:ready label is present
            if (!issue.labels.includes('status:ready')) {
              await github.updateIssueLabels(issueNumber, { add: ['status:ready'] });
            }
          } else {
            // Some checks failed - set Status = Needs Refinement
            core.info('DoR failed - setting Status to Needs Refinement');

            if (needsRefinementOption) {
              await projectClient.updateItemField(
                project.id,
                projectItem.id,
                statusField.id,
                needsRefinementOption.id
              );
            }

            // Remove status:ready if present
            if (issue.labels.includes('status:ready')) {
              await github.updateIssueLabels(issueNumber, { remove: ['status:ready'] });
            }

            // Add status:needs-refinement
            await github.updateIssueLabels(issueNumber, { add: ['status:needs-refinement'] });
          }
        }
      }
    }

    // Always comment with results (if there are failures or on manual trigger)
    if (!dorResult.passed || !addedLabel) {
      const comment = generateDoRComment(dorResult);
      await github.addComment(issueNumber, comment);
      core.info('Added DoR comment to issue');
    }

    // Set outputs
    core.setOutput('dor_passed', dorResult.passed.toString());
    core.setOutput('checks_passed', dorResult.requiredPassed.toString());
    core.setOutput('checks_total', dorResult.requiredTotal.toString());

  } catch (error) {
    core.setFailed(`DoR validation failed: ${error}`);
  }
}

main();
