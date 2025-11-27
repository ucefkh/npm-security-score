/**
 * SBOM (Software Bill of Materials) Detection Rule
 * Checks if package includes SBOM files
 * Bonus: +10 points
 */

const BaseRule = require('../core/BaseRule');
const TarballAnalyzer = require('../utils/tarballAnalyzer');

class SBOMDetectionRule extends BaseRule {
  constructor(bonus = 10, config = {}) {
    super(
      'sbom-detection',
      bonus,
      'Checks if package includes SBOM (Software Bill of Materials) files'
    );

    this.bonus = bonus;
    this.sbomPatterns = config.sbomPatterns || [
      // SPDX format
      /^spdx\.json$/i,
      /^\.spdx\.json$/i,
      /\.spdx$/i,
      // CycloneDX format
      /^bom\.json$/i,
      /^cyclonedx\.json$/i,
      /\.cdx\.json$/i,
      // Package lock files (can serve as SBOM)
      /^package-lock\.json$/i,
      /^yarn\.lock$/i,
      /^pnpm-lock\.yaml$/i,
      // Other SBOM formats
      /^sbom\.json$/i,
      /^software-bill-of-materials\.json$/i,
      /\.sbom$/i,
    ];
  }

  /**
   * Evaluate SBOM presence
   * @param {PackageMetadata} packageData - Package metadata
   * @returns {Promise<RuleResult>} Evaluation result
   */
  async evaluate(packageData) {
    if (!this.isEnabled()) {
      return {
        bonus: 0,
        details: { reason: 'Rule is disabled' },
        riskLevel: 'none',
      };
    }

    // Check for SBOM files in package
    const sbomFiles = await this._detectSBOMFiles(packageData);

    if (sbomFiles.length > 0) {
      return {
        bonus: this.bonus,
        details: {
          hasSBOM: true,
          sbomFiles,
          count: sbomFiles.length,
          description: `Package includes ${sbomFiles.length} SBOM file(s)`,
        },
        riskLevel: 'none',
      };
    }

    return {
      bonus: 0,
      details: {
        hasSBOM: false,
        description: 'Package does not include SBOM files',
      },
      riskLevel: 'none',
    };
  }

  /**
   * Detect SBOM files in package
   * @private
   */
  async _detectSBOMFiles(packageData) {
    const sbomFiles = [];

    // 1. Check files field in package.json
    if (packageData.files && Array.isArray(packageData.files)) {
      for (const file of packageData.files) {
        if (this._isSBOMFile(file)) {
          sbomFiles.push({
            path: file,
            source: 'package.json files field',
          });
        }
      }
    }

    // 2. Analyze tarball if available
    const tarballUrl = packageData.dist?.tarball;
    if (tarballUrl) {
      try {
        const tarballSBOMFiles = await this._analyzeTarball(tarballUrl, packageData.name);
        // Merge without duplicates
        for (const sbomFile of tarballSBOMFiles) {
          if (!sbomFiles.some((f) => f.path === sbomFile.path)) {
            sbomFiles.push(sbomFile);
          }
        }
      } catch (error) {
        // Tarball analysis failed - continue with other checks
      }
    }

    return sbomFiles;
  }

  /**
   * Analyze tarball for SBOM files
   * @private
   */
  async _analyzeTarball(tarballUrl, packageName) {
    const sbomFiles = [];
    const analyzer = new TarballAnalyzer();

    const analysis = await analyzer.analyzeTarball(tarballUrl, packageName);

    // Check file structure for SBOM files
    if (analysis.fileStructure && Array.isArray(analysis.fileStructure)) {
      for (const file of analysis.fileStructure) {
        if (file.type === 'file' && file.path) {
          const fileName = file.path.split('/').pop();
          if (this._isSBOMFile(fileName) || this._isSBOMFile(file.path)) {
            sbomFiles.push({
              path: file.path,
              source: 'tarball analysis',
              size: file.size || null,
            });
          }
        }
      }
    }

    return sbomFiles;
  }

  /**
   * Check if file is an SBOM file
   * @private
   */
  _isSBOMFile(fileName) {
    if (!fileName || typeof fileName !== 'string') {
      return false;
    }

    // Check against SBOM patterns
    return this.sbomPatterns.some((pattern) => pattern.test(fileName));
  }

  /**
   * Validate SBOM file format (placeholder for future implementation)
   * @private
   */
  async _validateSBOMFormat(filePath, content) {
    // Future implementation: Actually validate SBOM format
    // This would involve:
    // 1. Parsing JSON/YAML
    // 2. Validating against SPDX or CycloneDX schema
    // 3. Checking required fields
    // For now, we just check if files exist
    try {
      if (content) {
        const parsed = JSON.parse(content);
        // Basic validation: check if it looks like an SBOM
        if (parsed.spdxVersion || parsed.bomFormat || parsed.components) {
          return true;
        }
      }
    } catch (error) {
      // Not valid JSON or doesn't match SBOM structure
    }
    return false;
  }
}

module.exports = SBOMDetectionRule;

