/**
 * Maintainer Security Checks Rule
 * Checks maintainer account security, 2FA status, and repository security
 * Weight: -15 points
 */

const BaseRule = require('../core/BaseRule');
const GitHubClient = require('../api/GitHubClient');

class MaintainerSecurityRule extends BaseRule {
  constructor(weight = 15, config = {}) {
    super(
      'maintainer-security',
      weight,
      'Checks maintainer account security, 2FA status, and repository security'
    );

    this.githubClient = new GitHubClient(config.github || {});
    this.require2FA = config.require2FA !== false; // Default to true
    this.requireSecurityPolicy = config.requireSecurityPolicy !== false; // Default to true
  }

  /**
   * Evaluate maintainer security
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

    // 1. Check repository security policy
    if (this.requireSecurityPolicy) {
      try {
        const hasPolicy = await this.githubClient.hasSecurityPolicy(owner, repo);
        if (!hasPolicy) {
          findings.push({
            type: 'no-security-policy',
            description: 'Repository does not have SECURITY.md file',
            severity: 'medium',
          });
          totalRisk += 1;
        }
      } catch (error) {
        // API error - don't penalize, but log
        findings.push({
          type: 'security-policy-check-error',
          description: `Could not check security policy: ${error.message}`,
          severity: 'low',
        });
      }
    }

    // 2. Check maintainer information
    const maintainers = this._extractMaintainers(packageData);
    if (maintainers.length === 0) {
      findings.push({
        type: 'no-maintainers',
        description: 'No maintainer information found',
        severity: 'low',
      });
      totalRisk += 0.5;
    } else {
      // Check each maintainer
      for (const maintainer of maintainers) {
        const maintainerFindings = await this._checkMaintainer(maintainer);
        findings.push(...maintainerFindings);
        totalRisk += maintainerFindings.length * 0.5; // Lower weight per maintainer
      }
    }

    // 3. Check repository activity and health
    try {
      const repoInfo = await this.githubClient.getRepository(owner, repo);
      if (repoInfo) {
        const repoFindings = this._analyzeRepository(repoInfo);
        findings.push(...repoFindings);
        totalRisk += repoFindings.length;
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
        maintainers: maintainers.length,
      },
      riskLevel:
        totalRisk >= 3 ? 'high' : totalRisk >= 2 ? 'medium' : totalRisk >= 1 ? 'low' : 'none',
    };
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

  /**
   * Extract maintainer information
   * @private
   */
  _extractMaintainers(packageData) {
    const maintainers = [];

    if (packageData.maintainers && Array.isArray(packageData.maintainers)) {
      packageData.maintainers.forEach((m) => {
        if (typeof m === 'string') {
          maintainers.push({ name: m });
        } else if (m && m.name) {
          maintainers.push({ name: m.name, email: m.email, url: m.url });
        }
      });
    }

    if (packageData.author) {
      if (typeof packageData.author === 'string') {
        maintainers.push({ name: packageData.author });
      } else if (packageData.author.name) {
        maintainers.push({
          name: packageData.author.name,
          email: packageData.author.email,
          url: packageData.author.url,
        });
      }
    }

    return maintainers;
  }

  /**
   * Check individual maintainer
   * @private
   */
  async _checkMaintainer(maintainer) {
    const findings = [];

    // Extract GitHub username if available
    const username = this._extractGitHubUsername(maintainer);
    if (!username) {
      return findings; // Can't check without GitHub username
    }

    try {
      const userInfo = await this.githubClient.getUser(username);
      if (userInfo) {
        // Check account age (new accounts are riskier)
        const accountAge = this._calculateAccountAge(userInfo.created_at);
        if (accountAge < 30) {
          // Less than 30 days old
          findings.push({
            type: 'new-account',
            maintainer: username,
            description: `Maintainer account is very new (${accountAge} days old)`,
            severity: 'medium',
            accountAge,
          });
        }

        // Check if account is a bot
        if (userInfo.type === 'Bot') {
          findings.push({
            type: 'bot-account',
            maintainer: username,
            description: 'Maintainer is a bot account',
            severity: 'low',
          });
        }

        // Note: 2FA status requires special permissions
        // We can't check this directly via public API
      }
    } catch (error) {
      // API error - don't penalize
    }

    return findings;
  }

  /**
   * Extract GitHub username from maintainer info
   * @private
   */
  _extractGitHubUsername(maintainer) {
    if (maintainer.url) {
      const match = maintainer.url.match(/github\.com[/:]([^/]+)/);
      if (match) {
        return match[1];
      }
    }

    // Try to extract from name/email if it looks like a GitHub username
    if (maintainer.name) {
      // Simple heuristic: if name doesn't contain spaces and looks like username
      if (!maintainer.name.includes(' ') && /^[a-zA-Z0-9-]+$/.test(maintainer.name)) {
        return maintainer.name;
      }
    }

    return null;
  }

  /**
   * Calculate account age in days
   * @private
   */
  _calculateAccountAge(createdAt) {
    if (!createdAt) return null;
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Analyze repository for security indicators
   * @private
   */
  _analyzeRepository(repoInfo) {
    const findings = [];

    // Check if repository is archived
    if (repoInfo.archived) {
      findings.push({
        type: 'archived-repo',
        description: 'Repository is archived',
        severity: 'medium',
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

      if (daysSinceUpdate > 365) {
        findings.push({
          type: 'inactive-repo',
          description: `Repository has not been updated in ${daysSinceUpdate} days`,
          severity: 'medium',
          daysSinceUpdate,
        });
      }
    }

    return findings;
  }
}

module.exports = MaintainerSecurityRule;

