/**
 * Output formatters for CLI results
 */

const fs = require('fs').promises;
const path = require('path');
const MarkdownFormatter = require('./markdownFormatter');

class OutputFormatter {
  constructor(options = {}) {
    this.json = options.json || false;
    this.markdown = options.markdown || false;
    this.verbose = options.verbose || false;
    this._colorsEnabled = this.detectColors(options.colors);
    this.markdownFormatter = new MarkdownFormatter();
  }

  /**
   * Detect if colors should be used
   * @private
   */
  detectColors(forceColors) {
    if (forceColors !== undefined) {
      return forceColors;
    }
    // Check if output is a TTY and not in CI
    return (
      process.stdout.isTTY &&
      !process.env.CI &&
      process.env.TERM !== 'dumb'
    );
  }

  /**
   * Color codes for terminal output
   * @private
   */
  get colors() {
    if (!this._colorsEnabled) {
      return {
        reset: '',
        bright: '',
        dim: '',
        red: '',
        green: '',
        yellow: '',
        blue: '',
        magenta: '',
        cyan: '',
      };
    }

    return {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
    };
  }

  /**
   * Format a single score result
   * @param {Object} result - Scoring result
   * @returns {string|Object} Formatted output
   */
  formatResult(result) {
    if (this.json) {
      return this.formatJSON(result);
    }
    if (this.markdown) {
      return this.markdownFormatter.format(result);
    }
    return this.formatHumanReadable(result);
  }

  /**
   * Format multiple results
   * @param {Array<Object>} results - Array of scoring results
   * @returns {string|Object} Formatted output
   */
  formatResults(results) {
    if (this.json) {
      return this.formatJSON(results);
    }
    if (this.markdown) {
      return this.formatMarkdownMultiple(results);
    }
    return this.formatHumanReadableMultiple(results);
  }

  /**
   * Format as JSON with schema and metadata
   * @private
   */
  formatJSON(data) {
    // If it's a single result, wrap it with metadata
    if (data && data.score !== undefined) {
      return JSON.stringify(this._enrichWithMetadata(data), null, 2);
    }
    // If it's an array, enrich each item
    if (Array.isArray(data)) {
      const enriched = data.map((item) => {
        if (item.result) {
          return {
            ...item,
            result: this._enrichWithMetadata(item.result),
          };
        }
        return item;
      });
      return JSON.stringify(enriched, null, 2);
    }
    return JSON.stringify(data, null, 2);
  }

  /**
   * Enrich result with metadata and schema
   * @private
   */
  _enrichWithMetadata(result) {
    return {
      $schema: 'https://npm-security-score.schema.json',
      version: require('../../package.json').version,
      timestamp: result.timestamp || new Date().toISOString(),
      package: {
        name: result.packageName,
        version: result.packageVersion,
      },
      score: {
        value: result.score,
        band: result.band?.key || result.band?.label || 'UNKNOWN',
        bandLabel: result.band?.label || 'Unknown',
        bandDescription: result.band?.description || '',
        interpretation: this._getScoreInterpretation(result.score),
      },
      rules: this._formatRulesForJSON(result.ruleResults || []),
      summary: this._generateSummary(result),
      recommendations: this._generateRecommendations(result),
      metadata: {
        generatedAt: new Date().toISOString(),
        tool: 'npm-security-score',
        toolVersion: require('../../package.json').version,
      },
    };
  }

  /**
   * Format rules for JSON output
   * @private
   */
  _formatRulesForJSON(ruleResults) {
    return ruleResults.map((rule) => ({
      name: rule.ruleName,
      deduction: rule.deduction,
      riskLevel: rule.riskLevel,
      details: rule.details,
      enabled: true,
    }));
  }

  /**
   * Generate executive summary
   * @private
   */
  _generateSummary(result) {
    const totalDeductions = (result.ruleResults || []).reduce(
      (sum, rule) => sum + (rule.deduction || 0),
      0
    );
    const totalBonuses = (result.ruleResults || []).reduce(
      (sum, rule) => sum + (Math.max(0, rule.deduction) || 0),
      0
    );
    const issuesFound = (result.ruleResults || []).filter(
      (rule) => rule.deduction > 0
    ).length;

    return {
      finalScore: result.score,
      baseScore: 100,
      totalDeductions,
      totalBonuses,
      issuesFound,
      rulesEvaluated: result.ruleResults?.length || 0,
      riskLevel: result.band.key,
      isSafe: result.score >= 90,
      requiresReview: result.score >= 70 && result.score < 90,
      isHighRisk: result.score >= 50 && result.score < 70,
      shouldBlock: result.score < 50,
    };
  }

  /**
   * Generate recommendations
   * @private
   */
  _generateRecommendations(result) {
    const recommendations = [];

    if (result.score < 50) {
      recommendations.push({
        priority: 'critical',
        action: 'block',
        message: 'Package should be blocked in CI/CD. Significant security concerns detected.',
      });
    } else if (result.score < 70) {
      recommendations.push({
        priority: 'high',
        action: 'review',
        message: 'Thorough security review recommended before use.',
      });
    } else if (result.score < 90) {
      recommendations.push({
        priority: 'medium',
        action: 'review',
        message: 'Review recommended. Some security concerns detected.',
      });
    }

    // Rule-specific recommendations
    (result.ruleResults || []).forEach((rule) => {
      if (rule.deduction > 0) {
        const rec = this._getRuleRecommendation(rule);
        if (rec) {
          recommendations.push(rec);
        }
      }
    });

    return recommendations;
  }

  /**
   * Get recommendation for a specific rule
   * @private
   */
  _getRuleRecommendation(rule) {
    const recommendations = {
      'lifecycle-script-risk': {
        priority: 'high',
        action: 'review',
        message: 'Review lifecycle scripts for suspicious commands. Consider removing or replacing risky scripts.',
        remediation: [
          'Review all preinstall/postinstall scripts',
          'Remove any scripts that download or execute remote code',
          'Verify script contents match expected behavior',
        ],
      },
      'external-network-call': {
        priority: 'high',
        action: 'review',
        message: 'Package makes external network calls. Verify these are legitimate and secure.',
        remediation: [
          'Review network call destinations',
          'Ensure HTTPS is used for all connections',
          'Verify network calls are necessary and secure',
        ],
      },
      'maintainer-security': {
        priority: 'medium',
        action: 'review',
        message: 'Review maintainer security practices. Consider contacting maintainers about security improvements.',
        remediation: [
          'Check repository security policy',
          'Verify maintainer account security',
          'Consider contributing security improvements',
        ],
      },
      'code-obfuscation': {
        priority: 'medium',
        action: 'review',
        message: 'Package contains obfuscated or minified code. Review source code if available.',
        remediation: [
          'Request source code access',
          'Review minified code for suspicious patterns',
          'Consider alternatives if source is unavailable',
        ],
      },
      'advisory-history': {
        priority: 'high',
        action: 'update',
        message: 'Package has security advisories. Update to patched version if available.',
        remediation: [
          'Check for updated versions',
          'Review advisory details',
          'Apply security patches',
        ],
      },
      'update-behavior': {
        priority: 'medium',
        action: 'review',
        message: 'Suspicious update patterns detected. Review recent changes carefully.',
        remediation: [
          'Review recent version changes',
          'Check changelog for suspicious updates',
          'Verify update authenticity',
        ],
      },
      'community-signals': {
        priority: 'low',
        action: 'monitor',
        message: 'Repository shows low activity. Monitor for updates and security improvements.',
        remediation: [
          'Monitor repository activity',
          'Check for security policy updates',
          'Consider contributing to improve security',
        ],
      },
    };

    return recommendations[rule.ruleName] || null;
  }

  /**
   * Get score interpretation
   * @private
   */
  _getScoreInterpretation(score) {
    if (score >= 90) {
      return 'Package appears safe to use with minimal security concerns.';
    }
    if (score >= 70) {
      return 'Package is generally safe but review recommended for production use.';
    }
    if (score >= 50) {
      return 'Package has significant security concerns. Thorough review required.';
    }
    return 'Package has critical security issues. Block in CI/CD and avoid use.';
  }

  /**
   * Format as human-readable text
   * @private
   */
  formatHumanReadable(result) {
    const c = this.colors;
    const lines = [];

    // Header
    lines.push('');
    lines.push(
      `${c.bright}${c.cyan}${'='.repeat(60)}${c.reset}`
    );
    lines.push(
      `${c.bright}Security Score Report${c.reset}`
    );
    lines.push(
      `${c.cyan}${'='.repeat(60)}${c.reset}`
    );
    lines.push('');

    // Package info
    lines.push(
      `${c.bright}Package:${c.reset} ${result.packageName}@${result.packageVersion}`
    );
    lines.push(
      `${c.bright}Timestamp:${c.reset} ${new Date(result.timestamp).toLocaleString()}`
    );
    lines.push('');

    // Score
    const scoreColor = this.getScoreColor(result.score);
    lines.push(
      `${c.bright}Security Score:${c.reset} ${scoreColor}${result.score}/100${c.reset}`
    );
    lines.push(
      `${c.bright}Band:${c.reset} ${result.band.emoji} ${c.bright}${result.band.label}${c.reset}`
    );
    lines.push(
      `${c.dim}${result.band.description}${c.reset}`
    );
    lines.push('');

    // Rule results
    if (result.ruleResults && result.ruleResults.length > 0) {
      lines.push(`${c.bright}Rule Results:${c.reset}`);
      lines.push('');

      result.ruleResults.forEach((ruleResult) => {
        if (ruleResult.deduction > 0 || this.verbose) {
          const deductionColor =
            ruleResult.deduction > 0 ? c.red : c.green;
          lines.push(
            `  ${c.bright}${ruleResult.ruleName}${c.reset}`
          );
          lines.push(
            `    Deduction: ${deductionColor}-${ruleResult.deduction} points${c.reset}`
          );
          lines.push(
            `    Risk Level: ${this.formatRiskLevel(ruleResult.riskLevel)}`
          );

          if (this.verbose && ruleResult.details) {
            const details = this.formatRuleDetails(ruleResult.details);
            if (details) {
              lines.push(details);
            }
          }
          lines.push('');
        }
      });
    } else {
      lines.push(`${c.green}✅ No security issues detected${c.reset}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format multiple results
   * @private
   */
  formatHumanReadableMultiple(results) {
    const lines = [];
    const c = this.colors;

    lines.push('');
    lines.push(
      `${c.bright}${c.cyan}${'='.repeat(60)}${c.reset}`
    );
    lines.push(
      `${c.bright}Batch Security Score Report${c.reset}`
    );
    lines.push(
      `${c.cyan}${'='.repeat(60)}${c.reset}`
    );
    lines.push('');

    results.forEach((item, index) => {
      if (item.success) {
        const result = item.result;
        const scoreColor = this.getScoreColor(result.score);
        lines.push(
          `${index + 1}. ${c.bright}${result.packageName}@${result.packageVersion}${c.reset}`
        );
        lines.push(
          `   Score: ${scoreColor}${result.score}/100${c.reset} | ${result.band.emoji} ${result.band.label}`
        );
      } else {
        lines.push(
          `${index + 1}. ${c.red}${item.package}@${item.version}${c.reset} - ${c.red}Error: ${item.error}${c.reset}`
        );
      }
      lines.push('');
    });

    // Summary
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const avgScore =
      successful.length > 0
        ? successful.reduce((sum, r) => sum + r.result.score, 0) /
          successful.length
        : 0;

    lines.push(`${c.bright}Summary:${c.reset}`);
    lines.push(`  Total: ${results.length}`);
    lines.push(`  Successful: ${c.green}${successful.length}${c.reset}`);
    if (failed.length > 0) {
      lines.push(`  Failed: ${c.red}${failed.length}${c.reset}`);
    }
    if (successful.length > 0) {
      lines.push(
        `  Average Score: ${this.getScoreColor(avgScore)}${avgScore.toFixed(2)}/100${c.reset}`
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get color for score
   * @private
   */
  getScoreColor(score) {
    const c = this.colors;
    if (score >= 90) return c.green;
    if (score >= 70) return c.yellow;
    if (score >= 50) return c.magenta;
    return c.red;
  }

  /**
   * Format risk level
   * @private
   */
  formatRiskLevel(riskLevel) {
    const c = this.colors;
    const levels = {
      none: `${c.green}None${c.reset}`,
      low: `${c.yellow}Low${c.reset}`,
      medium: `${c.magenta}Medium${c.reset}`,
      high: `${c.red}High${c.reset}`,
      critical: `${c.red}${c.bright}Critical${c.reset}`,
      error: `${c.red}Error${c.reset}`,
    };
    return levels[riskLevel] || riskLevel;
  }

  /**
   * Format rule details
   * @private
   */
  formatRuleDetails(details) {
    if (!details || Object.keys(details).length === 0) {
      return null;
    }

    const c = this.colors;
    const lines = [];

    if (details.findings && Array.isArray(details.findings)) {
      details.findings.forEach((finding) => {
        lines.push(`    ${c.yellow}⚠️  ${finding.hook || 'Finding'}:${c.reset}`);
        if (finding.script) {
          lines.push(`       Script: ${c.dim}${finding.script.substring(0, 80)}${finding.script.length > 80 ? '...' : ''}${c.reset}`);
        }
        if (finding.issues && Array.isArray(finding.issues)) {
          finding.issues.forEach((issue) => {
            lines.push(`       - ${issue.type}: ${issue.description}`);
          });
        }
      });
    }

    return lines.length > 0 ? lines.join('\n') : null;
  }

  /**
   * Format comparison between two packages
   * @param {Object} result1 - First package result
   * @param {Object} result2 - Second package result
   * @returns {string|Object} Formatted comparison
   */
  formatComparison(result1, result2) {
    if (this.json) {
      return this.formatJSON({
        package1: result1,
        package2: result2,
        comparison: {
          scoreDifference: result1.score - result2.score,
          recommendation:
            result1.score > result2.score
              ? result1.packageName
              : result2.packageName,
        },
      });
    }

    const c = this.colors;
    const lines = [];

    lines.push('');
    lines.push(
      `${c.bright}${c.cyan}${'='.repeat(60)}${c.reset}`
    );
    lines.push(
      `${c.bright}Package Comparison${c.reset}`
    );
    lines.push(
      `${c.cyan}${'='.repeat(60)}${c.reset}`
    );
    lines.push('');

    // Package 1
    const scoreColor1 = this.getScoreColor(result1.score);
    lines.push(
      `${c.bright}${result1.packageName}@${result1.packageVersion}${c.reset}`
    );
    lines.push(
      `  Score: ${scoreColor1}${result1.score}/100${c.reset} | ${result1.band.emoji} ${result1.band.label}`
    );
    lines.push('');

    // Package 2
    const scoreColor2 = this.getScoreColor(result2.score);
    lines.push(
      `${c.bright}${result2.packageName}@${result2.packageVersion}${c.reset}`
    );
    lines.push(
      `  Score: ${scoreColor2}${result2.score}/100${c.reset} | ${result2.band.emoji} ${result2.band.label}`
    );
    lines.push('');

    // Comparison
    const diff = result1.score - result2.score;
    const diffColor = diff > 0 ? c.green : diff < 0 ? c.red : c.dim;
    const recommendation =
      result1.score > result2.score ? result1.packageName : result2.packageName;

    lines.push(`${c.bright}Comparison:${c.reset}`);
    lines.push(
      `  Score Difference: ${diffColor}${diff > 0 ? '+' : ''}${diff.toFixed(2)}${c.reset}`
    );
    lines.push(
      `  Recommendation: ${c.bright}${recommendation}${c.reset} (higher security score)`
    );
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format multiple results as Markdown
   * @private
   */
  formatMarkdownMultiple(results) {
    const lines = [];
    lines.push('# Batch Security Score Report');
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Total Packages:** ${results.length}`);
    lines.push('');

    results.forEach((item, index) => {
      if (item.success) {
        lines.push(`## ${index + 1}. ${item.result.packageName}@${item.result.packageVersion}`);
        lines.push('');
        lines.push(this.markdownFormatter._formatSummary(item.result));
        lines.push('');
      } else {
        lines.push(`## ${index + 1}. ${item.package}@${item.version || 'unknown'}`);
        lines.push('');
        lines.push(`❌ **Error:** ${item.error}`);
        lines.push('');
      }
    });

    // Summary
    const successful = results.filter((r) => r.success);
    if (successful.length > 0) {
      const avgScore =
        successful.reduce((sum, r) => sum + r.result.score, 0) /
        successful.length;
      lines.push('## Summary');
      lines.push('');
      lines.push(`- **Total:** ${results.length}`);
      lines.push(`- **Successful:** ${successful.length}`);
      lines.push(`- **Failed:** ${results.length - successful.length}`);
      lines.push(`- **Average Score:** ${avgScore.toFixed(2)}/100`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Write output to file
   * @param {string} filePath - Path to output file
   * @param {string|Object} content - Content to write
   * @returns {Promise<void>}
   */
  async writeToFile(filePath, content) {
    const fullPath = path.resolve(filePath);
    let output;

    // Determine format based on file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.md' || ext === '.markdown') {
      // Markdown format
      if (content && content.score !== undefined) {
        output = this.markdownFormatter.format(content);
      } else if (Array.isArray(content)) {
        output = this.formatMarkdownMultiple(content);
      } else {
        output = this.formatJSON(content);
      }
    } else if (ext === '.json') {
      // JSON format
      output = typeof content === 'string' ? content : this.formatJSON(content);
    } else {
      // Default to JSON
      output = typeof content === 'string' ? content : this.formatJSON(content);
    }

    await fs.writeFile(fullPath, output, 'utf-8');
  }
}

module.exports = OutputFormatter;

