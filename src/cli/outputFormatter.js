/**
 * Output formatters for CLI results
 */

const fs = require('fs').promises;
const path = require('path');

class OutputFormatter {
  constructor(options = {}) {
    this.json = options.json || false;
    this.verbose = options.verbose || false;
    this._colorsEnabled = this.detectColors(options.colors);
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
    return this.formatHumanReadableMultiple(results);
  }

  /**
   * Format as JSON
   * @private
   */
  formatJSON(data) {
    return JSON.stringify(data, null, 2);
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
   * Write output to file
   * @param {string} filePath - Path to output file
   * @param {string|Object} content - Content to write
   * @returns {Promise<void>}
   */
  async writeToFile(filePath, content) {
    const fullPath = path.resolve(filePath);
    const output =
      typeof content === 'string' ? content : this.formatJSON(content);

    await fs.writeFile(fullPath, output, 'utf-8');
  }
}

module.exports = OutputFormatter;

