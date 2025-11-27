/**
 * Lifecycle Script Risk Detection Rule
 * Detects suspicious commands and patterns in npm lifecycle scripts
 * Weight: -30 points
 */

const BaseRule = require('../core/BaseRule');
const PackageAnalyzer = require('../utils/packageAnalyzer');

class LifecycleScriptRiskRule extends BaseRule {
  constructor(weight = 30) {
    super(
      'lifecycle-script-risk',
      weight,
      'Detects suspicious commands and patterns in npm lifecycle scripts'
    );

    // Suspicious command patterns
    this.suspiciousCommands = [
      // Network tools
      /\bcurl\s+[^\s]+/i,
      /\bwget\s+[^\s]+/i,
      /\bhttp\s+[^\s]+/i,
      /\bftp\s+[^\s]+/i,
      /\bnc\s+[^\s]+/i,
      /\bnetcat\s+[^\s]+/i,
      /\btelnet\s+[^\s]+/i,
      // Node.js network modules
      /\brequire\s*\(\s*['"]https?['"]\s*\)/i,
      /\brequire\s*\(\s*['"]http['"]\s*\)/i,
      /\brequire\s*\(\s*['"]https['"]\s*\)/i,
      /\brequire\s*\(\s*['"]request['"]\s*\)/i,
      /\brequire\s*\(\s*['"]axios['"]\s*\)/i,
      // Direct network calls
      /\bfetch\s*\(/i,
      /\bXMLHttpRequest/i,
      // Download commands
      /\bdownload/i,
      /\bwget\s+.*http/i,
      /\bcurl\s+.*http/i,
      // Remote execution
      /\beval\s*\(/i,
      /\bFunction\s*\(/i,
      /\bexec\s*\(/i,
      /\bexecSync\s*\(/i,
      /\bspawn\s*\(/i,
      /\bspawnSync\s*\(/i,
    ];

    // Obfuscation patterns
    this.obfuscationPatterns = [
      // Base64 encoded strings
      /[A-Za-z0-9+/]{50,}={0,2}/g,
      // Hex encoded strings
      /\\x[0-9a-fA-F]{2}/g,
      // Character code arrays
      /String\.fromCharCode\s*\(/i,
      // Multiple nested evals
      /\beval\s*\(\s*eval\s*\(/i,
      // Obfuscated variable names
      /\b[a-z]\$[a-z0-9]+\$/i,
    ];

    // High-risk patterns (immediate flag)
    this.highRiskPatterns = [
      /\bcurl\s+.*\|\s*sh/i,
      /\bcurl\s+.*\|\s*bash/i,
      /\bwget\s+.*\|\s*sh/i,
      /\bwget\s+.*\|\s*bash/i,
      /\bhttp.*\|\s*sh/i,
      /\bhttp.*\|\s*bash/i,
      /\beval\s*\(\s*.*http/i,
      /\bFunction\s*\(\s*.*http/i,
    ];
  }

  /**
   * Evaluate lifecycle scripts for risks
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

    const lifecycleScripts = PackageAnalyzer.extractLifecycleScripts(
      packageData
    );

    if (Object.keys(lifecycleScripts).length === 0) {
      return {
        deduction: 0,
        details: { reason: 'No lifecycle scripts found' },
        riskLevel: 'none',
      };
    }

    const findings = [];
    let totalRisk = 0;
    let hasHighRisk = false;

    // Analyze each lifecycle script
    for (const [hook, script] of Object.entries(lifecycleScripts)) {
      const normalizedScript = PackageAnalyzer.normalizeScript(script);
      const scriptAnalysis = this._analyzeScript(normalizedScript, hook);

      if (scriptAnalysis.risk > 0) {
        findings.push({
          hook,
          script: normalizedScript,
          risk: scriptAnalysis.risk,
          riskLevel: scriptAnalysis.riskLevel,
          issues: scriptAnalysis.issues,
          isHighRisk: scriptAnalysis.isHighRisk,
        });

        totalRisk += scriptAnalysis.risk;
        if (scriptAnalysis.isHighRisk) {
          hasHighRisk = true;
        }
      }
    }

    // Calculate deduction based on findings
    let deduction = 0;
    if (hasHighRisk || totalRisk >= 3) {
      // High risk or multiple issues - full deduction
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
        totalScripts: Object.keys(lifecycleScripts).length,
        riskyScripts: findings.length,
        totalRisk,
        hasHighRisk,
      },
      riskLevel: hasHighRisk ? 'high' : totalRisk >= 2 ? 'medium' : totalRisk >= 1 ? 'low' : 'none',
    };
  }

  /**
   * Analyze a single script for risks
   * @private
   */
  _analyzeScript(script, _hook) {
    const issues = [];
    let risk = 0;
    let isHighRisk = false;

    // Check for high-risk patterns first
    for (const pattern of this.highRiskPatterns) {
      if (pattern.test(script)) {
        issues.push({
          type: 'high-risk-pattern',
          pattern: pattern.toString(),
          description: 'High-risk pattern detected: potential remote code execution',
        });
        risk += 3;
        isHighRisk = true;
        break; // One high-risk pattern is enough
      }
    }

    // Check for suspicious commands
    for (const pattern of this.suspiciousCommands) {
      if (pattern.test(script)) {
        issues.push({
          type: 'suspicious-command',
          pattern: pattern.toString(),
          description: 'Suspicious command detected in lifecycle script',
        });
        risk += 1;
      }
    }

    // Check for obfuscation
    for (const pattern of this.obfuscationPatterns) {
      const matches = script.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          type: 'obfuscation',
          pattern: pattern.toString(),
          description: 'Possible obfuscation detected',
          matches: matches.length,
        });
        risk += 2;
      }
    }

    // Check for command chaining (potential for malicious combinations)
    const chainPattern = /&&|\|\||;/g;
    const chains = script.match(chainPattern);
    if (chains && chains.length >= 3) {
      issues.push({
        type: 'excessive-chaining',
        description: 'Excessive command chaining detected',
        chainCount: chains.length,
      });
      risk += 1;
    }

    // Determine risk level
    let riskLevel = 'none';
    if (isHighRisk || risk >= 3) {
      riskLevel = 'high';
    } else if (risk >= 2) {
      riskLevel = 'medium';
    } else if (risk >= 1) {
      riskLevel = 'low';
    }

    return {
      risk,
      riskLevel,
      issues,
      isHighRisk,
    };
  }
}

module.exports = LifecycleScriptRiskRule;

