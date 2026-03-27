import * as core from '@actions/core';
import { GitHubClient } from '../lib/github.js';
import { ProjectClient } from '../lib/project.js';

async function main() {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const owner = process.env.REPO_OWNER || '';
    const repo = process.env.REPO_NAME || '';
    const prNumber = parseInt(process.env.PR_NUMBER || '0', 10);
    const prAction = process.env.PR_ACTION || '';
    const prMerged = process.env.PR_MERGED === 'true';

    if (!token || !owner || !repo || !prNumber) {
      throw new Error('Missing required environment variables');
    }

    core.info(`Processing PR #${prNumber} - Action: ${prAction}, Merged: ${prMerged}`);

    const github = new GitHubClient(token, owner, repo);
    const projectClient = new ProjectClient(token);

    // Get PR details
    const pr = await github.getPullRequest(prNumber);
    core.info(`PR Title: ${pr.title}`);

    // Extract linked issues
    const linkedIssues = github.extractLinkedIssues(pr.body);
    core.info(`Found ${linkedIssues.length} linked issue(s): ${linkedIssues.join(', ')}`);

    if (linkedIssues.length === 0) {
      core.info('No linked issues found in PR body');
      return;
    }

    // Find Scrum Board project
    const project = await projectClient.findProject(owner, 'Scrum Board');
    if (!project) {
      core.warning('Scrum Board project not found');
      return;
    }

    // Get project fields
    const fields = await projectClient.getProjectFields(project.id);
    const statusField = fields.find((f) => f.name === 'Status');

    if (!statusField) {
      core.warning('Status field not found in project');
      return;
    }

    // Get status options
    const inProgressOption = statusField.options?.find((o) => o.name === 'In Progress');
    const reviewOption = statusField.options?.find((o) => o.name === 'Review');
    const doneOption = statusField.options?.find((o) => o.name === 'Done');

    // Get project items to find matching items
    const items = await projectClient.getProjectItems(project.id);

    // Process each linked issue
    for (const issueNumber of linkedIssues) {
      try {
        core.info(`Processing linked issue #${issueNumber}`);

        // Get issue details
        const issue = await github.getIssue(issueNumber);

        // Find project item for this issue
        const projectItem = items.find((item) => item.content?.number === issueNumber);

        if (prAction === 'opened') {
          // PR opened: Status → Review
          core.info(`  Setting status to Review`);

          if (projectItem && reviewOption) {
            await projectClient.updateItemField(
              project.id,
              projectItem.id,
              statusField.id,
              reviewOption.id
            );
          }

          // Update labels
          await github.updateIssueLabels(issueNumber, {
            remove: ['status:in-progress', 'status:ready'],
            add: ['status:review'],
          });

          // Comment
          await github.addComment(issueNumber, `PR #${prNumber} opened for review`);

        } else if (prAction === 'closed') {
          if (prMerged) {
            // PR merged: Status → Done, close issue
            core.info(`  PR merged - Setting status to Done and closing issue`);

            if (projectItem && doneOption) {
              await projectClient.updateItemField(
                project.id,
                projectItem.id,
                statusField.id,
                doneOption.id
              );
            }

            // Remove all status labels
            await github.updateIssueLabels(issueNumber, {
              remove: ['status:ready', 'status:in-progress', 'status:blocked', 'status:review'],
            });

            // Close issue with reference
            await github.closeIssue(issueNumber, `Merged in PR #${prNumber} (${pr.head})`);

          } else {
            // PR closed without merge: Status → In Progress
            core.info(`  PR closed without merge - Setting status to In Progress`);

            if (projectItem && inProgressOption) {
              await projectClient.updateItemField(
                project.id,
                projectItem.id,
                statusField.id,
                inProgressOption.id
              );
            }

            // Update labels
            await github.updateIssueLabels(issueNumber, {
              remove: ['status:review'],
              add: ['status:in-progress'],
            });

            // Comment
            await github.addComment(
              issueNumber,
              `PR #${prNumber} closed without merge - returning to In Progress`
            );
          }
        }
      } catch (error) {
        core.warning(`Failed to process issue #${issueNumber}: ${error}`);
      }
    }

    core.info('PR status update complete');

  } catch (error) {
    core.setFailed(`PR status update failed: ${error}`);
  }
}

main();
