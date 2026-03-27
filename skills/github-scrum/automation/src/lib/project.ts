import { graphql } from '@octokit/graphql';
import * as core from '@actions/core';

export interface Project {
  id: string;
  number: number;
  title: string;
  url: string;
}

export interface ProjectField {
  id: string;
  name: string;
  type: string;
  options?: Array<{ id: string; name: string }>;
}

export interface ProjectItem {
  id: string;
  content?: {
    type: string;
    number?: number;
    title?: string;
    url?: string;
  };
  fieldValues: Record<string, string | number>;
}

export interface Iteration {
  id: string;
  title: string;
  startDate: string;
  duration: number;
}

const SIZE_TO_POINTS: Record<string, number> = {
  'XS': 1,
  'S': 2,
  'M': 4,
  'L': 8,
  'XL': 16,
};

export class ProjectClient {
  private graphqlWithAuth: typeof graphql;

  constructor(token: string) {
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
  }

  async findProject(owner: string, title: string): Promise<Project | null> {
    const query = `
      query($owner: String!) {
        organization(login: $owner) {
          projectsV2(first: 20) {
            nodes {
              id
              number
              title
              url
            }
          }
        }
        user(login: $owner) {
          projectsV2(first: 20) {
            nodes {
              id
              number
              title
              url
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphqlWithAuth<{ 
        organization?: { projectsV2: { nodes: Project[] } };
        user?: { projectsV2: { nodes: Project[] } };
      }>(query, { owner });

      const projects = [
        ...(result.organization?.projectsV2.nodes || []),
        ...(result.user?.projectsV2.nodes || []),
      ];

      return projects.find((p) => p.title === title) || null;
    } catch (error) {
      core.warning(`Failed to find project: ${error}`);
      return null;
    }
  }

  async getProjectFields(projectId: string): Promise<ProjectField[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 50) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
                ... on ProjectV2IterationField {
                  id
                  name
                  dataType
                  configuration {
                    iterations {
                      id
                      title
                      startDate
                      duration
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphqlWithAuth<{
        node: {
          fields: {
            nodes: Array<{
              id: string;
              name: string;
              dataType: string;
              options?: Array<{ id: string; name: string }>;
              configuration?: {
                iterations: Array<{
                  id: string;
                  title: string;
                  startDate: string;
                  duration: number;
                }>;
              };
            }>;
          };
        };
      }>(query, { projectId });

      return result.node.fields.nodes.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.dataType,
        options: f.options,
      }));
    } catch (error) {
      core.error(`Failed to get project fields: ${error}`);
      throw error;
    }
  }

  async getProjectItems(projectId: string): Promise<ProjectItem[]> {
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100) {
              nodes {
                id
                content {
                  ... on Issue {
                    number
                    title
                    url
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field { name }
                      optionId
                      name
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field { name }
                      number
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      field { name }
                      text
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      field { name }
                      iterationId
                      title
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphqlWithAuth<{
        node: {
          items: {
            nodes: Array<{
              id: string;
              content?: {
                number?: number;
                title?: string;
                url?: string;
              };
              fieldValues: {
                nodes: Array<{
                  field: { name: string };
                  optionId?: string;
                  name?: string;
                  number?: number;
                  text?: string;
                  iterationId?: string;
                  title?: string;
                }>;
              };
            }>;
          };
        };
      }>(query, { projectId });

      return result.node.items.nodes.map((item) => {
        const fieldValues: Record<string, string | number> = {};
        
        for (const fv of item.fieldValues.nodes) {
          if (fv.name) {
            fieldValues[fv.field.name] = fv.name;
          } else if (fv.number !== undefined) {
            fieldValues[fv.field.name] = fv.number;
          } else if (fv.text) {
            fieldValues[fv.field.name] = fv.text;
          } else if (fv.title) {
            fieldValues[fv.field.name] = fv.title;
          }
        }

        return {
          id: item.id,
          content: item.content,
          fieldValues,
        };
      });
    } catch (error) {
      core.error(`Failed to get project items: ${error}`);
      throw error;
    }
  }

  async updateItemField(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: string | number
  ): Promise<void> {
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: $value
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `;

    try {
      await this.graphqlWithAuth(mutation, {
        projectId,
        itemId,
        fieldId,
        value: typeof value === 'string' 
          ? { singleSelectOptionId: value }
          : { number: value },
      });
    } catch (error) {
      core.error(`Failed to update item field: ${error}`);
      throw error;
    }
  }

  getCurrentIteration(items: ProjectItem[]): Iteration | null {
    const now = new Date();
    
    for (const item of items) {
      const sprint = item.fieldValues['Sprint'];
      if (sprint && typeof sprint === 'string') {
        // Parse iteration info from field value
        // This is simplified - real implementation would need iteration metadata
        return {
          id: 'current',
          title: sprint,
          startDate: now.toISOString(),
          duration: 14,
        };
      }
    }
    
    return null;
  }

  calculateEstimate(size: string): number {
    return SIZE_TO_POINTS[size?.toUpperCase()] || 0;
  }

  calculateSprintCapacity(items: ProjectItem[]): number {
    return items.reduce((total, item) => {
      const size = item.fieldValues['Size'] as string;
      return total + this.calculateEstimate(size);
    }, 0);
  }
}
