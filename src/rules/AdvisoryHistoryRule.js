/**
 * Advisory History Analysis Rule
 * Analyzes security advisory history for packages
 * Weight: -15 points
 */

const BaseRule = require('../core/BaseRule');
const AdvisoryClient = require('../api/AdvisoryClient');

class AdvisoryHistoryRule extends BaseRule {
  constructor(weight = 15, config = {}) {
    super(
      'advisory-history',
      weight,
      'Analyzes security advisory history and malware incidents'
    );

    this.advisoryClient = new AdvisoryClient(config.advisory || {});
    this.requireVersion = config.requireVersion !== false; // Default to true
  }

  /**
   * Evaluate package advisory history
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

    if (!packageData || !packageData.name) {
      return {
        deduction: 0,
        details: { reason: 'Package name is required' },
        riskLevel: 'none',
      };
    }

    const packageName = packageData.name;
    const packageVersion = packageData.version;

    try {
      // Fetch advisories
      const advisories = await this.advisoryClient.getAdvisories(
        packageName,
        packageVersion
      );

      if (advisories.length === 0) {
        return {
          deduction: 0,
          details: {
            advisories: [],
            totalAdvisories: 0,
            hasMalware: false,
            hasCriticalAdvisories: false,
          },
          riskLevel: 'none',
        };
      }

      // Analyze advisories
      const analysis = this._analyzeAdvisories(advisories, packageVersion);

      // Calculate deduction based on findings
      let deduction = 0;
      if (analysis.hasMalware) {
        // Malware history - full deduction
        deduction = this.weight;
      } else if (analysis.criticalCount > 0) {
        // Critical advisories - high deduction
        deduction = Math.floor(this.weight * 0.9);
      } else if (analysis.highCount > 0) {
        // High severity - medium deduction
        deduction = Math.floor(this.weight * 0.75);
      } else if (analysis.moderateCount > 0) {
        // Moderate severity - small deduction
        deduction = Math.floor(this.weight * 0.5);
      } else if (analysis.lowCount > 0) {
        // Low severity - minimal deduction
        deduction = Math.floor(this.weight * 0.25);
      }

      return {
        deduction,
        details: {
          advisories: advisories.map((adv) => ({
            id: adv.id,
            title: adv.title,
            severity: adv.severity,
            source: adv.source,
            isMalware: adv.isMalware,
            cve: adv.cve,
            url: adv.url,
          })),
          totalAdvisories: advisories.length,
          analysis,
        },
        riskLevel: this._calculateRiskLevel(analysis),
      };
    } catch (error) {
      // API error - don't penalize, but log
      return {
        deduction: 0,
        details: {
          error: error.message,
          reason: 'Failed to fetch advisories',
        },
        riskLevel: 'error',
      };
    }
  }

  /**
   * Analyze advisories
   * @private
   */
  _analyzeAdvisories(advisories, packageVersion) {
    const analysis = {
      total: advisories.length,
      criticalCount: 0,
      highCount: 0,
      moderateCount: 0,
      lowCount: 0,
      unknownCount: 0,
      hasMalware: false,
      recentAdvisories: 0,
      cveCount: 0,
    };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const advisory of advisories) {
      // Count by severity
      switch (advisory.severity) {
        case 'critical':
          analysis.criticalCount++;
          break;
        case 'high':
          analysis.highCount++;
          break;
        case 'moderate':
          analysis.moderateCount++;
          break;
        case 'low':
          analysis.lowCount++;
          break;
        default:
          analysis.unknownCount++;
      }

      // Check for malware
      if (advisory.isMalware) {
        analysis.hasMalware = true;
      }

      // Check for CVE
      if (advisory.cve) {
        analysis.cveCount++;
      }

      // Check if advisory is recent
      if (advisory.published) {
        const publishedDate = new Date(advisory.published);
        if (publishedDate >= thirtyDaysAgo) {
          analysis.recentAdvisories++;
        }
      }

      // Check if current version is affected
      if (packageVersion && advisory.vulnerableVersions) {
        // Simple version range check (could be enhanced with semver)
        if (this._isVersionAffected(packageVersion, advisory.vulnerableVersions)) {
          analysis.affectsCurrentVersion = true;
        }
      }
    }

    return analysis;
  }

  /**
   * Check if version is affected by vulnerable range
   * @private
   */
  _isVersionAffected(version, vulnerableRange) {
    if (!vulnerableRange || vulnerableRange === '*') {
      return true; // All versions affected
    }

    // Simple check - if version is mentioned in range
    // Full semver range parsing would require a library like semver
    return vulnerableRange.includes(version) || vulnerableRange === '*';
  }

  /**
   * Calculate risk level from analysis
   * @private
   */
  _calculateRiskLevel(analysis) {
    if (analysis.hasMalware) {
      return 'high';
    }
    if (analysis.criticalCount > 0) {
      return 'high';
    }
    if (analysis.highCount > 0) {
      return 'medium';
    }
    if (analysis.moderateCount > 0 || analysis.recentAdvisories > 0) {
      return 'medium';
    }
    if (analysis.lowCount > 0) {
      return 'low';
    }
    return 'none';
  }
}

module.exports = AdvisoryHistoryRule;

