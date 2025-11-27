/**
 * Scoring service that orchestrates package fetching and scoring
 */

const {
  ScoreCalculator,
  NpmRegistryClient,
  TarballAnalyzer,
  LifecycleScriptRiskRule,
  ExternalNetworkCallRule,
  MaintainerSecurityRule,
  CodeObfuscationRule,
  config,
} = require('../index');

class ScoringService {
  constructor(options = {}) {
    this.config = options.config || config.getAll();
    this.verbose = options.verbose || false;
    this.registryClient = new NpmRegistryClient(this.config.api?.npm);
    this.tarballAnalyzer = options.tarballAnalyzer || new TarballAnalyzer();
  }

  /**
   * Initialize score calculator with all rules
   * @returns {ScoreCalculator} Configured score calculator
   */
  createCalculator() {
    const calculator = new ScoreCalculator(this.config.scoring);

    // Register all enabled rules
    if (this.config.rules?.lifecycleScriptRisk?.enabled) {
      const rule = new LifecycleScriptRiskRule(
        this.config.rules.lifecycleScriptRisk.weight
      );
      calculator.registerRule(rule);
    }

    if (this.config.rules?.externalNetworkCalls?.enabled) {
      const rule = new ExternalNetworkCallRule(
        this.config.rules.externalNetworkCalls.weight
      );
      calculator.registerRule(rule);
    }

    if (this.config.rules?.maintainerSecurity?.enabled) {
      const rule = new MaintainerSecurityRule(
        this.config.rules.maintainerSecurity.weight,
        this.config.api?.github
      );
      calculator.registerRule(rule);
    }

    if (this.config.rules?.obfuscatedCode?.enabled) {
      const rule = new CodeObfuscationRule(
        this.config.rules.obfuscatedCode.weight,
        this.config.rules.obfuscatedCode
      );
      calculator.registerRule(rule);
    }

    return calculator;
  }

  /**
   * Fetch and analyze package data
   * @param {string} packageName - Package name
   * @param {string} version - Optional version
   * @returns {Promise<Object>} Package data ready for scoring
   */
  async fetchPackageData(packageName, version = null) {
    if (this.verbose) {
      console.log(`📦 Fetching metadata for ${packageName}${version ? `@${version}` : ''}...`);
    }

    // Fetch package metadata
    const packageMetadata = await this.registryClient.getPackageMetadata(
      packageName,
      version
    );

    if (this.verbose) {
      console.log(`✅ Fetched metadata for ${packageMetadata.name}@${packageMetadata.version}`);
    }

    // Download and analyze tarball if needed for obfuscation detection
    let tarballAnalysis = null;
    if (this.config.rules?.obfuscatedCode?.enabled) {
      if (this.verbose) {
        console.log('📥 Downloading package tarball for analysis...');
      }

      try {
        const tarballUrl = packageMetadata.dist?.tarball;
        if (tarballUrl) {
          tarballAnalysis = await this.tarballAnalyzer.analyzeTarball(
            tarballUrl,
            packageMetadata.name
          );
          if (this.verbose) {
            console.log(`✅ Analyzed ${tarballAnalysis.totalFiles} files`);
          }
        }
      } catch (error) {
        if (this.verbose) {
          console.warn(`⚠️  Failed to analyze tarball: ${error.message}`);
        }
        // Continue without tarball analysis
      }
    }

    // Merge tarball analysis into package metadata
    if (tarballAnalysis) {
      packageMetadata.tarballAnalysis = tarballAnalysis;
    }

    return packageMetadata;
  }

  /**
   * Score a single package
   * @param {string} packageName - Package name
   * @param {string} version - Optional version
   * @returns {Promise<Object>} Scoring result
   */
  async scorePackage(packageName, version = null) {
    const calculator = this.createCalculator();
    const packageData = await this.fetchPackageData(packageName, version);

    if (this.verbose) {
      console.log('🔍 Calculating security score...');
    }

    const result = await calculator.calculateScore(packageData);

    return result;
  }

  /**
   * Score multiple packages
   * @param {Array<string>} packages - Array of package names (with optional versions)
   * @returns {Promise<Array<Object>>} Array of scoring results
   */
  async scorePackages(packages) {
    const results = [];

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      const [name, version] = pkg.includes('@') && !pkg.startsWith('@')
        ? pkg.split('@')
        : [pkg, null];

      try {
        if (this.verbose) {
          console.log(`\n[${i + 1}/${packages.length}] Processing ${name}...`);
        }

        const result = await this.scorePackage(name, version);
        results.push({
          success: true,
          result,
        });
      } catch (error) {
        results.push({
          success: false,
          package: name,
          version: version || 'latest',
          error: error.message,
        });
      }
    }

    return results;
  }
}

module.exports = ScoringService;

