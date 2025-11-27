/**
 * Community Signals Analysis Rule
 * Checks repository activity, community engagement, and security policy
 * Weight: -5 points
 */

const BaseRule = require('../core/BaseRule');
const GitHubClient = require('../api/GitHubClient');

class CommunitySignalsRule extends BaseRule {
  constructor(weight = 5, config = {}) {
    super(
      'community-signals',
      weight,
      'Checks repository activity, community engagement, and security policy'
    );

    this.githubClient = new GitHubClient(config.github || {});
    this.inactiveThresholdDays = config.inactiveThresholdDays || 180; // 6 months
    this.lowActivityThresholdDays = config.lowActivityThresholdDays || 90; // 3 months
    this.minCommitsPerMonth = config.minCommitsPerMonth || 1;
  }

  /**
   * Evaluate community signals
   * @param {PackageMetadata} packageData - Package metadata
   * @returns {Promise<RuleResult>} Evaluation result
   */
  async evaluate(packageData) {
    if (!this.isEnabled()) {
      return {
        deduction: 0,
        details: { reason: 'Rule is disabled' },
        riskLevel: 'none',
      };
    }

    const findings = [];
    let totalRisk = 0;

    // Extract repository information
    const repository = this._extractRepository(packageData);
    if (!repository) {
      return {
        deduction: 0,
        details: { reason: 'No repository information found' },
        riskLevel: 'none',
      };
    }

    const { owner, repo } = repository;

    // 1. Check repository activity (commits, issues, PRs)
    try {
      const activityFindings = await this._checkRepositoryActivity(owner, repo);
      findings.push(...activityFindings);
      totalRisk += activityFindings.length * 0.5;
    } catch (error) {
      findings.push({
        type: 'activity-check-error',
        description: `Could not check repository activity: ${error.message}`,
        severity: 'low',
      });
    }

    // 2. Check security policy and responsible disclosure
    try {
      const securityFindings = await this._checkSecurityPolicy(owner, repo);
      findings.push(...securityFindings);
      totalRisk += securityFindings.length * 0.5;
    } catch (error) {
      findings.push({
        type: 'security-policy-check-error',
        description: `Could not check security policy: ${error.message}`,
        severity: 'low',
      });
    }

    // 3. Check repository health
    try {
      const repoInfo = await this.githubClient.getRepository(owner, repo);
      if (repoInfo) {
        const healthFindings = this._checkRepositoryHealth(repoInfo);
        findings.push(...healthFindings);
        totalRisk += healthFindings.length * 0.3;
      }
    } catch (error) {
      // API error - don't penalize
    }

    // Calculate deduction based on findings
    let deduction = 0;
    if (totalRisk >= 3) {
      // High risk - full deduction
      deduction = this.weight;
    } else if (totalRisk >= 2) {
      // Medium risk - partial deduction
      deduction = Math.floor(this.weight * 0.75);
    } else if (totalRisk >= 1) {
      // Low risk - small deduction
      deduction = Math.floor(this.weight * 0.5);
    }

    return {
      deduction,
      details: {
        findings,
        totalRisk: Math.round(totalRisk * 10) / 10,
        repository: { owner, repo },
      },
      riskLevel:
        totalRisk >= 3 ? 'high' : totalRisk >= 2 ? 'medium' : totalRisk >= 1 ? 'low' : 'none',
    };
  }

  /**
   * Check repository activity (commits, issues, PRs)
   * @private
   */
  async _checkRepositoryActivity(owner, repo) {
    const findings = [];
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - this.lowActivityThresholdDays * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - this.inactiveThresholdDays * 24 * 60 * 60 * 1000);

    // Check commit frequency
    try {
      const commits = await this.githubClient.getCommits(owner, repo, {
        since: sixMonthsAgo.toISOString(),
        per_page: 100, // Get up to 100 commits
      });

      if (!commits || commits.length === 0) {
        findings.push({
          type: 'no-recent-commits',
          description: `No commits in the last ${this.inactiveThresholdDays} days`,
          severity: 'high',
          daysSinceLastCommit: this.inactiveThresholdDays,
        });
      } else {
        // Check commit frequency
        const recentCommits = commits.filter((commit) => {
          const commitDate = new Date(commit.commit.author.date);
          return commitDate >= threeMonthsAgo;
        });

        if (recentCommits.length === 0) {
          findings.push({
            type: 'low-commit-activity',
            description: `No commits in the last ${this.lowActivityThresholdDays} days`,
            severity: 'medium',
            daysSinceLastCommit: this.lowActivityThresholdDays,
          });
        } else {
          // Calculate commits per month
          const months = this.lowActivityThresholdDays / 30;
          const commitsPerMonth = recentCommits.length / months;
          if (commitsPerMonth < this.minCommitsPerMonth) {
            findings.push({
              type: 'low-commit-frequency',
              description: `Low commit frequency: ${commitsPerMonth.toFixed(1)} commits/month (minimum: ${this.minCommitsPerMonth})`,
              severity: 'low',
              commitsPerMonth: Math.round(commitsPerMonth * 10) / 10,
            });
          }
        }
      }
    } catch (error) {
      // Error fetching commits - don't penalize heavily
      findings.push({
        type: 'commit-check-error',
        description: `Could not check commit activity: ${error.message}`,
        severity: 'low',
      });
    }

    // Check issue/PR activity
    try {
      const issues = await this.githubClient.getIssues(owner, repo, {
        state: 'all',
        per_page: 30, // Get recent issues
      });

      const pullRequests = await this.githubClient.getPullRequests(owner, repo, {
        state: 'all',
        per_page: 30, // Get recent PRs
      });

      // Filter to recent activity
      const recentIssues = issues.filter((issue) => {
        const issueDate = new Date(issue.created_at);
        return issueDate >= threeMonthsAgo;
      });

      const recentPRs = pullRequests.filter((pr) => {
        const prDate = new Date(pr.created_at);
        return prDate >= threeMonthsAgo;
      });

      if (recentIssues.length === 0 && recentPRs.length === 0) {
        findings.push({
          type: 'no-recent-community-activity',
          description: `No issues or pull requests in the last ${this.lowActivityThresholdDays} days`,
          severity: 'low',
        });
      }

      // Check for open issues (indicates active maintenance)
      const openIssues = issues.filter((issue) => issue.state === 'open' && !issue.pull_request);
      if (openIssues.length > 50) {
        findings.push({
          type: 'many-open-issues',
          description: `Repository has ${openIssues.length} open issues (may indicate maintenance issues)`,
          severity: 'low',
          openIssuesCount: openIssues.length,
        });
      }
    } catch (error) {
      // Error fetching issues/PRs - don't penalize heavily
      findings.push({
        type: 'issue-pr-check-error',
        description: `Could not check issue/PR activity: ${error.message}`,
        severity: 'low',
      });
    }

    return findings;
  }

  /**
   * Check security policy and responsible disclosure
   * @private
   */
  async _checkSecurityPolicy(owner, repo) {
    const findings = [];

    // Check for SECURITY.md
    const hasSecurityPolicy = await this.githubClient.hasSecurityPolicy(owner, repo);
    if (!hasSecurityPolicy) {
      findings.push({
        type: 'no-security-policy',
        description: 'Repository does not have SECURITY.md file',
        severity: 'medium',
      });
    } else {
      // Try to read and analyze SECURITY.md content
      try {
        const securityPolicy = await this.githubClient.getRepositoryContents(owner, repo, 'SECURITY.md');
        if (securityPolicy && securityPolicy.content) {
          // GitHub API returns content as base64-encoded string
          let content = null;
          try {
            // Remove any whitespace/newlines from base64 string
            const cleanBase64 = securityPolicy.content.replace(/\s/g, '');
            content = Buffer.from(cleanBase64, 'base64').toString('utf-8');
          } catch (decodeError) {
            // If decoding fails, try using content as-is (might already be decoded)
            if (typeof securityPolicy.content === 'string') {
              content = securityPolicy.content;
            }
          }
          
          if (content && content.trim().length > 0) {
            const hasResponsibleDisclosure = this._checkResponsibleDisclosure(content);
            
            if (!hasResponsibleDisclosure) {
              findings.push({
                type: 'no-responsible-disclosure',
                description: 'SECURITY.md exists but does not clearly describe responsible disclosure process',
                severity: 'low',
              });
            }
          }
        }
      } catch (error) {
        // Can't read security policy content - not a major issue
      }
    }

    return findings;
  }

  /**
   * Check if security policy mentions responsible disclosure
   * @private
   */
  _checkResponsibleDisclosure(content) {
    if (!content) return false;

    const lowerContent = content.toLowerCase();
    const keywords = [
      'responsible disclosure',
      'security disclosure',
      'security@',
      'security email',
      'report vulnerability',
      'vulnerability reporting',
      'security issue',
      'coordinated disclosure',
    ];

    return keywords.some((keyword) => lowerContent.includes(keyword));
  }

  /**
   * Check repository health indicators
   * @private
   */
  _checkRepositoryHealth(repoInfo) {
    const findings = [];

    // Check if repository is archived
    if (repoInfo.archived) {
      findings.push({
        type: 'archived-repo',
        description: 'Repository is archived',
        severity: 'high',
      });
    }

    // Check if repository is disabled
    if (repoInfo.disabled) {
      findings.push({
        type: 'disabled-repo',
        description: 'Repository is disabled',
        severity: 'high',
      });
    }

    // Check last update time
    if (repoInfo.pushed_at) {
      const lastPush = new Date(repoInfo.pushed_at);
      const now = new Date();
      const daysSinceUpdate = Math.floor((now - lastPush) / (1000 * 60 * 60 * 24));

      if (daysSinceUpdate > this.inactiveThresholdDays) {
        findings.push({
          type: 'inactive-repo',
          description: `Repository has not been updated in ${daysSinceUpdate} days`,
          severity: 'high',
          daysSinceUpdate,
        });
      } else if (daysSinceUpdate > this.lowActivityThresholdDays) {
        findings.push({
          type: 'low-activity-repo',
          description: `Repository has low activity (last update: ${daysSinceUpdate} days ago)`,
          severity: 'medium',
          daysSinceUpdate,
        });
      }
    }

    // Check if repository has very few stars/forks (may indicate low community engagement)
    if (repoInfo.stargazers_count !== undefined && repoInfo.stargazers_count < 5) {
      findings.push({
        type: 'low-community-engagement',
        description: `Repository has very few stars (${repoInfo.stargazers_count}), indicating low community engagement`,
        severity: 'low',
        stargazersCount: repoInfo.stargazers_count,
      });
    }

    return findings;
  }

  /**
   * Extract repository information from package data
   * @private
   */
  _extractRepository(packageData) {
    if (!packageData) return null;

    // Try repository field
    if (packageData.repository) {
      if (typeof packageData.repository === 'string') {
        // Parse GitHub URL
        const match = packageData.repository.match(/github\.com[/:]([^/]+)\/([^/]+)/);
        if (match) {
          return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
        }
      } else if (packageData.repository.url) {
        const match = packageData.repository.url.match(/github\.com[/:]([^/]+)\/([^/]+)/);
        if (match) {
          return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
        }
      }
    }

    // Try homepage
    if (packageData.homepage) {
      const match = packageData.homepage.match(/github\.com[/:]([^/]+)\/([^/]+)/);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }

    return null;
  }
}

module.exports = CommunitySignalsRule;

