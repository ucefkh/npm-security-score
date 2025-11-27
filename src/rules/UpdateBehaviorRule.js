/**
 * Update Behavior Analysis Rule
 * Analyzes version history to detect suspicious update patterns
 * Weight: -10 points
 */

const BaseRule = require('../core/BaseRule');
const NpmRegistryClient = require('../api/NpmRegistryClient');
const PackageAnalyzer = require('../utils/packageAnalyzer');

class UpdateBehaviorRule extends BaseRule {
  constructor(weight = 10, config = {}) {
    super(
      'update-behavior',
      weight,
      'Analyzes version history to detect suspicious update patterns'
    );

    this.registryClient = config.registryClient || new NpmRegistryClient();
    this.sizeIncreaseThreshold = config.sizeIncreaseThreshold || 0.5; // 50% increase
    this.maxVersionsToAnalyze = config.maxVersionsToAnalyze || 10; // Analyze last 10 versions
    this.versionJumpThreshold = config.versionJumpThreshold || 2; // Major version jump threshold
  }

  /**
   * Evaluate package update behavior
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
        details: { reason: 'Invalid package data' },
        riskLevel: 'none',
      };
    }

    try {
      // Fetch version history
      const versionHistory = await this._fetchVersionHistory(packageData.name);
      
      if (!versionHistory || Object.keys(versionHistory).length < 2) {
        return {
          deduction: 0,
          details: { reason: 'Insufficient version history for analysis' },
          riskLevel: 'none',
        };
      }

      // Analyze version changes
      const analysis = await this._analyzeVersionChanges(
        packageData,
        versionHistory
      );

      // Calculate risk and deduction
      const { deduction, riskLevel } = this._calculateRisk(analysis);

      return {
        deduction,
        details: {
          analysis,
          versionCount: Object.keys(versionHistory).length,
          analyzedVersions: analysis.versionsAnalyzed,
        },
        riskLevel,
      };
    } catch (error) {
      // If we can't fetch version history, don't penalize
      return {
        deduction: 0,
        details: {
          reason: 'Could not analyze version history',
          error: error.message,
        },
        riskLevel: 'none',
      };
    }
  }

  /**
   * Fetch version history from npm registry
   * @private
   */
  async _fetchVersionHistory(packageName) {
    try {
      const allVersions = await this.registryClient.getAllVersions(packageName);
      return allVersions;
    } catch (error) {
      throw new Error(`Failed to fetch version history: ${error.message}`);
    }
  }

  /**
   * Analyze version changes for suspicious patterns
   * @private
   */
  async _analyzeVersionChanges(currentPackage, versionHistory) {
    const findings = [];
    const versions = Object.keys(versionHistory).sort(this._compareVersions);
    const currentVersion = currentPackage.version || versions[versions.length - 1];

    // Get recent versions to analyze (last N versions)
    const recentVersions = versions.slice(-this.maxVersionsToAnalyze);
    const currentIndex = recentVersions.indexOf(currentVersion);
    
    // If current version is not in recent versions, analyze from the end
    const versionsToAnalyze = currentIndex >= 0 
      ? recentVersions.slice(0, currentIndex + 1)
      : recentVersions.slice(-5); // Analyze last 5 if current not found

    let previousVersion = null;
    let previousMetadata = null;

    for (const version of versionsToAnalyze) {
      const versionMetadata = versionHistory[version];
      
      if (!versionMetadata) continue;

      if (previousVersion && previousMetadata) {
        const changes = this._compareVersionMetadata(previousMetadata, versionMetadata, previousVersion, version);
        
        if (changes.hasIssues) {
          findings.push({
            fromVersion: previousVersion,
            toVersion: version,
            changes,
            timestamp: versionMetadata.time || null,
          });
        }
      }

      previousVersion = version;
      previousMetadata = versionMetadata;
    }

    // Check for unusual version jumps
    const versionJumps = this._detectVersionJumps(versions);
    if (versionJumps.length > 0) {
      findings.push(...versionJumps.map(jump => ({
        type: 'version-jump',
        fromVersion: jump.from,
        toVersion: jump.to,
        jumpType: jump.type,
        description: `Unusual version jump: ${jump.from} → ${jump.to} (${jump.type})`,
      })));
    }

    return {
      findings,
      versionsAnalyzed: versionsToAnalyze.length,
      totalVersions: versions.length,
      hasSuspiciousChanges: findings.length > 0,
    };
  }

  /**
   * Compare two version metadata objects for changes
   * @private
   */
  _compareVersionMetadata(prevMetadata, currMetadata, _prevVersion, _currVersion) {
    const changes = {
      hasIssues: false,
      sizeChange: null,
      scriptChanges: null,
      dependencyChanges: null,
    };

    // 1. Check size changes
    const prevSize = prevMetadata.dist?.unpackedSize || 0;
    const currSize = currMetadata.dist?.unpackedSize || 0;
    
    if (prevSize > 0 && currSize > 0) {
      const sizeIncrease = (currSize - prevSize) / prevSize;
      
      if (sizeIncrease > this.sizeIncreaseThreshold) {
        changes.sizeChange = {
          previous: prevSize,
          current: currSize,
          increase: sizeIncrease,
          increasePercent: Math.round(sizeIncrease * 100),
          description: `Size increased by ${Math.round(sizeIncrease * 100)}% (${this._formatBytes(prevSize)} → ${this._formatBytes(currSize)})`,
          severity: sizeIncrease > 1 ? 'high' : 'medium', // >100% is high
        };
        changes.hasIssues = true;
      }
    }

    // 2. Check script changes
    const prevScripts = PackageAnalyzer.extractLifecycleScripts(prevMetadata);
    const currScripts = PackageAnalyzer.extractLifecycleScripts(currMetadata);
    
    const scriptChanges = this._detectScriptChanges(prevScripts, currScripts);
    if (scriptChanges.hasChanges) {
      changes.scriptChanges = scriptChanges;
      changes.hasIssues = true;
    }

    // 3. Check dependency changes (significant additions)
    const prevDeps = PackageAnalyzer.extractDependencies(prevMetadata);
    const currDeps = PackageAnalyzer.extractDependencies(currMetadata);
    
    const depChanges = this._detectDependencyChanges(prevDeps, currDeps);
    if (depChanges.hasSignificantChanges) {
      changes.dependencyChanges = depChanges;
      changes.hasIssues = true;
    }

    return changes;
  }

  /**
   * Detect script changes between versions
   * @private
   */
  _detectScriptChanges(prevScripts, currScripts) {
    const changes = {
      hasChanges: false,
      added: [],
      removed: [],
      modified: [],
      newSuspiciousScripts: [],
    };

    const prevHooks = Object.keys(prevScripts);
    const currHooks = Object.keys(currScripts);

    // Find added scripts
    for (const hook of currHooks) {
      if (!prevHooks.includes(hook)) {
        changes.added.push({
          hook,
          script: currScripts[hook],
        });
        changes.hasChanges = true;

        // Check if new script is suspicious
        if (this._isSuspiciousScript(currScripts[hook])) {
          changes.newSuspiciousScripts.push({
            hook,
            script: currScripts[hook],
            description: 'New suspicious script detected in lifecycle hook',
          });
        }
      }
    }

    // Find removed scripts
    for (const hook of prevHooks) {
      if (!currHooks.includes(hook)) {
        changes.removed.push({
          hook,
          script: prevScripts[hook],
        });
        changes.hasChanges = true;
      }
    }

    // Find modified scripts
    for (const hook of prevHooks) {
      if (currHooks.includes(hook)) {
        const prevScript = PackageAnalyzer.normalizeScript(prevScripts[hook]);
        const currScript = PackageAnalyzer.normalizeScript(currScripts[hook]);
        
        if (prevScript !== currScript) {
          changes.modified.push({
            hook,
            previous: prevScript,
            current: currScript,
          });
          changes.hasChanges = true;

          // Check if modified script became suspicious
          if (!this._isSuspiciousScript(prevScript) && this._isSuspiciousScript(currScript)) {
            changes.newSuspiciousScripts.push({
              hook,
              script: currScript,
              description: 'Script modified to include suspicious patterns',
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Detect dependency changes
   * @private
   */
  _detectDependencyChanges(prevDeps, currDeps) {
    const changes = {
      hasSignificantChanges: false,
      added: [],
      removed: [],
      totalAdded: 0,
      totalRemoved: 0,
    };

    // Check all dependency types
    const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    
    for (const depType of depTypes) {
      const prev = prevDeps[depType] || {};
      const curr = currDeps[depType] || {};
      
      const prevKeys = Object.keys(prev);
      const currKeys = Object.keys(curr);

      // Find added dependencies
      for (const dep of currKeys) {
        if (!prevKeys.includes(dep)) {
          changes.added.push({
            name: dep,
            version: curr[dep],
            type: depType,
          });
          changes.totalAdded++;
        }
      }

      // Find removed dependencies
      for (const dep of prevKeys) {
        if (!currKeys.includes(dep)) {
          changes.removed.push({
            name: dep,
            version: prev[dep],
            type: depType,
          });
          changes.totalRemoved++;
        }
      }
    }

    // Significant if many dependencies added (potential supply chain risk)
    if (changes.totalAdded > 10) {
      changes.hasSignificantChanges = true;
    }

    return changes;
  }

  /**
   * Detect unusual version jumps
   * @private
   */
  _detectVersionJumps(versions) {
    const jumps = [];
    
    // Sort versions properly
    const sortedVersions = [...versions].sort((a, b) => this._compareVersionStrings(a, b));
    
    for (let i = 1; i < sortedVersions.length; i++) {
      const prev = sortedVersions[i - 1];
      const curr = sortedVersions[i];
      
      const jump = this._analyzeVersionJump(prev, curr);
      if (jump.isUnusual) {
        jumps.push({
          from: prev,
          to: curr,
          type: jump.type,
          magnitude: jump.magnitude,
        });
      }
    }

    return jumps;
  }

  /**
   * Analyze if a version jump is unusual
   * @private
   */
  _analyzeVersionJump(prevVersion, currVersion) {
    const prev = this._parseVersion(prevVersion);
    const curr = this._parseVersion(currVersion);

    if (!prev || !curr) {
      return { isUnusual: false };
    }

    // Major version jump (e.g., 1.0.0 -> 3.0.0)
    if (curr.major - prev.major >= this.versionJumpThreshold) {
      return {
        isUnusual: true,
        type: 'major-jump',
        magnitude: curr.major - prev.major,
      };
    }

    // Skip minor versions (e.g., 1.0.0 -> 1.5.0)
    if (curr.major === prev.major && curr.minor - prev.minor > 5) {
      return {
        isUnusual: true,
        type: 'minor-jump',
        magnitude: curr.minor - prev.minor,
      };
    }

    return { isUnusual: false };
  }

  /**
   * Parse semantic version
   * @private
   */
  _parseVersion(version) {
    // Remove leading 'v' if present
    const cleanVersion = version.replace(/^v/, '');
    
    // Match semantic version pattern
    const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?(?:\+(.+))?$/);
    
    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] || null,
      build: match[5] || null,
    };
  }

  /**
   * Compare version strings for sorting
   * @private
   */
  _compareVersionStrings(a, b) {
    const aParsed = this._parseVersion(a);
    const bParsed = this._parseVersion(b);

    if (!aParsed || !bParsed) {
      return a.localeCompare(b);
    }

    if (aParsed.major !== bParsed.major) {
      return aParsed.major - bParsed.major;
    }
    if (aParsed.minor !== bParsed.minor) {
      return aParsed.minor - bParsed.minor;
    }
    if (aParsed.patch !== bParsed.patch) {
      return aParsed.patch - bParsed.patch;
    }

    return 0;
  }

  /**
   * Check if script contains suspicious patterns
   * @private
   */
  _isSuspiciousScript(script) {
    if (!script || typeof script !== 'string') {
      return false;
    }

    const suspiciousPatterns = [
      /\bcurl\s+[^\s]+/i,
      /\bwget\s+[^\s]+/i,
      /\beval\s*\(/i,
      /\bfetch\s*\(/i,
      /\brequire\s*\(\s*['"]https?['"]\s*\)/i,
      /\bcurl\s+.*\|\s*sh/i,
      /\bcurl\s+.*\|\s*bash/i,
      /\bwget\s+.*\|\s*sh/i,
      /\bwget\s+.*\|\s*bash/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(script));
  }

  /**
   * Calculate risk and deduction based on findings
   * @private
   */
  _calculateRisk(analysis) {
    if (!analysis.hasSuspiciousChanges || analysis.findings.length === 0) {
      return {
        deduction: 0,
        riskLevel: 'none',
      };
    }

    let riskScore = 0;
    let hasHighRisk = false;

    for (const finding of analysis.findings) {
      if (finding.type === 'version-jump') {
        riskScore += 1;
      } else if (finding.changes) {
        // Size changes
        if (finding.changes.sizeChange) {
          const severity = finding.changes.sizeChange.severity;
          if (severity === 'high') {
            riskScore += 3;
            hasHighRisk = true;
          } else {
            riskScore += 1;
          }
        }

        // Script changes
        if (finding.changes.scriptChanges?.newSuspiciousScripts?.length > 0) {
          riskScore += finding.changes.scriptChanges.newSuspiciousScripts.length * 2;
          hasHighRisk = true;
        } else if (finding.changes.scriptChanges?.hasChanges) {
          riskScore += 1;
        }

        // Dependency changes
        if (finding.changes.dependencyChanges?.hasSignificantChanges) {
          riskScore += 1;
        }
      }
    }

    // Calculate deduction
    let deduction = 0;
    if (hasHighRisk || riskScore >= 5) {
      deduction = this.weight; // Full deduction
    } else if (riskScore >= 3) {
      deduction = Math.floor(this.weight * 0.75); // 75% deduction
    } else if (riskScore >= 1) {
      deduction = Math.floor(this.weight * 0.5); // 50% deduction
    }

    // Determine risk level
    let riskLevel = 'none';
    if (hasHighRisk || riskScore >= 5) {
      riskLevel = 'high';
    } else if (riskScore >= 3) {
      riskLevel = 'medium';
    } else if (riskScore >= 1) {
      riskLevel = 'low';
    }

    return {
      deduction,
      riskLevel,
    };
  }

  /**
   * Format bytes to human-readable string
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = UpdateBehaviorRule;

