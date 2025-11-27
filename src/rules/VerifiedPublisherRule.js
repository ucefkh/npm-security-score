/**
 * Verified Publisher Detection Rule
 * Checks if package is published by a verified npm publisher
 * Bonus: +10 points
 */

const BaseRule = require('../core/BaseRule');
const NpmRegistryClient = require('../api/NpmRegistryClient');

class VerifiedPublisherRule extends BaseRule {
  constructor(bonus = 10, config = {}) {
    super(
      'verified-publisher',
      bonus,
      'Checks if package is published by a verified npm publisher'
    );

    this.bonus = bonus;
    this.npmClient = new NpmRegistryClient(config.npm || {});
  }

  /**
   * Evaluate verified publisher status
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

    // Check if publisher is verified
    // npm registry metadata includes publisher information
    let isVerified = this._checkVerifiedPublisher(packageData);

    // If not verified in basic check, try fetching full metadata
    if (!isVerified && packageData.name) {
      try {
        isVerified = await this._fetchFullMetadata(packageData.name);
      } catch (error) {
        // If fetch fails, continue with basic check result
      }
    }

    if (isVerified) {
      return {
        bonus: this.bonus,
        details: {
          verified: true,
          publisher: packageData.publisher || packageData._npmUser || null,
          description: 'Package is published by a verified npm publisher',
        },
        riskLevel: 'none',
      };
    }

    return {
      bonus: 0,
      details: {
        verified: false,
        description: 'Package is not published by a verified npm publisher',
      },
      riskLevel: 'none',
    };
  }

  /**
   * Check if publisher is verified
   * @private
   */
  _checkVerifiedPublisher(packageData) {
    // Check for verified publisher indicators in package metadata
    // npm registry includes publisher information in the metadata
    // Verified publishers typically have specific fields set

    // Check publisher field
    if (packageData.publisher) {
      // npm verified publishers have specific structure
      // Check if publisher has verified status
      if (packageData.publisher.verified === true) {
        return true;
      }
    }

    // Check _npmUser field (legacy)
    if (packageData._npmUser) {
      // Some verified publishers may have this field
      // Additional checks can be added here
    }

    // Check for verified organization
    // Scoped packages (@org/package) from verified orgs
    if (packageData.name && packageData.name.startsWith('@')) {
      // For scoped packages, we might need to check org verification
      // This would require additional API calls
      // For now, we'll check if the package has publisher info
      if (packageData.publisher) {
        return packageData.publisher.verified === true;
      }
    }

    // Check dist-tags for verified indicators
    // Some packages may have verification metadata in dist-tags
    if (packageData['dist-tags']) {
      // Additional verification checks can be added
    }

    // Try to fetch full package metadata to check verification
    // This is a fallback if basic checks don't work
    return false;
  }

  /**
   * Fetch full package metadata to check verification
   * @private
   */
  async _fetchFullMetadata(packageName) {
    try {
      const fullMetadata = await this.npmClient.getPackageMetadata(packageName);
      return this._checkVerifiedPublisher(fullMetadata);
    } catch (error) {
      // If we can't fetch, return false
      return false;
    }
  }
}

module.exports = VerifiedPublisherRule;

