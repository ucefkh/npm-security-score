/**
 * Core scoring engine for npm packages
 * Calculates security scores based on multiple risk factors
 */

const { getScoreBand } = require('./scoreBands');
const RuleRegistry = require('./RuleRegistry');

class ScoreCalculator {
  constructor(config = {}) {
    this.config = {
      baseScore: 100,
      minScore: 0,
      maxScore: 100,
      ...config,
    };
    this.ruleRegistry = new RuleRegistry();
  }

  /**
   * Register a security rule
   * @param {SecurityRule} rule - The security rule to register
   */
  registerRule(rule) {
    this.ruleRegistry.register(rule);
  }

  /**
   * Calculate security score for a package
   * @param {PackageMetadata} packageData - Package metadata and analysis results
   * @returns {Promise<ScoreResult>} The calculated score and details
   */
  async calculateScore(packageData) {
    if (!packageData) {
      throw new Error('Package data is required');
    }

    const rules = this.ruleRegistry.getActiveRules();
    let score = this.config.baseScore;
    const ruleResults = [];

    // Evaluate each rule
    for (const rule of rules) {
      try {
        const result = await rule.evaluate(packageData);
        // Handle deductions (negative impact)
        score -= result.deduction || 0;
        // Handle bonuses (positive impact)
        score += result.bonus || 0;
        ruleResults.push({
          ruleName: rule.name,
          deduction: result.deduction || 0,
          bonus: result.bonus || 0,
          details: result.details || {},
          riskLevel: result.riskLevel || 'none',
        });
      } catch (error) {
        // Log error but continue with other rules
        // eslint-disable-next-line no-console
        console.warn(`Error evaluating rule ${rule.name}:`, error.message);
        ruleResults.push({
          ruleName: rule.name,
          deduction: 0,
          bonus: 0,
          details: { error: error.message },
          riskLevel: 'error',
        });
      }
    }

    // Ensure score is within bounds
    score = Math.max(this.config.minScore, Math.min(this.config.maxScore, score));

    // Determine score band
    const band = getScoreBand(score);

    return {
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      band,
      ruleResults,
      packageName: packageData.name,
      packageVersion: packageData.version,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get all registered rules
   * @returns {Array<SecurityRule>} Array of registered rules
   */
  getRules() {
    return this.ruleRegistry.getActiveRules();
  }
}

module.exports = ScoreCalculator;

