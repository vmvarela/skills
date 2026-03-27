import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  html_url: string;
}

export interface LabelUpdate {
  add?: string[];
  remove?: string[];
}

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  async getIssue(number: number): Promise<Issue> {
    try {
      const { data } = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state,
        labels: data.labels.map((label) => 
          typeof label === 'string' ? label : label.name || ''
        ),
        html_url: data.html_url,
      };
    } catch (error) {
      core.error(`Failed to get issue #${number}: ${error}`);
      throw error;
    }
  }

  async updateIssueLabels(number: number, update: LabelUpdate): Promise<void> {
    try {
      if (update.remove && update.remove.length > 0) {
        for (const label of update.remove) {
          await this.octokit.rest.issues.removeLabel({
            owner: this.owner,
            repo: this.repo,
            issue_number: number,
            name: label,
          });
        }
      }

      if (update.add && update.add.length > 0) {
        await this.octokit.rest.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: number,
          labels: update.add,
        });
      }
    } catch (error) {
      core.warning(`Failed to update labels for issue #${number}: ${error}`);
    }
  }

  async createIssue(title: string, body: string, labels: string[]): Promise<number> {
    try {
      const { data } = await this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        labels,
      });
      return data.number;
    } catch (error) {
      core.error(`Failed to create issue: ${error}`);
      throw error;
    }
  }

  async closeIssue(number: number, comment?: string): Promise<void> {
    try {
      if (comment) {
        await this.addComment(number, comment);
      }

      await this.octokit.rest.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        state: 'closed',
      });
    } catch (error) {
      core.error(`Failed to close issue #${number}: ${error}`);
      throw error;
    }
  }

  async addComment(number: number, body: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: number,
        body,
      });
    } catch (error) {
      core.error(`Failed to add comment to issue #${number}: ${error}`);
      throw error;
    }
  }

  async listOpenIssues(): Promise<Issue[]> {
    try {
      const { data } = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100,
      });

      return data.map((issue) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state,
        labels: issue.labels.map((label) =>
          typeof label === 'string' ? label : label.name || ''
        ),
        html_url: issue.html_url,
      }));
    } catch (error) {
      core.error(`Failed to list issues: ${error}`);
      throw error;
    }
  }

  async getPullRequest(number: number) {
    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: number,
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state,
        merged: data.merged,
        head: data.head.sha,
      };
    } catch (error) {
      core.error(`Failed to get PR #${number}: ${error}`);
      throw error;
    }
  }

  extractLinkedIssues(body: string): number[] {
    const matches = body.match(/(closes|fixes|resolves)\s+#(\d+)/gi);
    if (!matches) return [];
    
    return matches
      .map((match) => {
        const num = match.match(/#(\d+)/);
        return num ? parseInt(num[1], 10) : null;
      })
      .filter((n): n is number => n !== null);
  }
}
