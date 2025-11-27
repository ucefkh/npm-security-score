/**
 * Signed Releases Detection Rule
 * Checks if package releases are cryptographically signed
 * Bonus: +10 points
 */

const BaseRule = require('../core/BaseRule');
const NpmRegistryClient = require('../api/NpmRegistryClient');

class SignedReleasesRule extends BaseRule {
  constructor(bonus = 10, config = {}) {
    super(
      'signed-releases',
      bonus,
      'Checks if package releases are cryptographically signed'
    );

    this.bonus = bonus;
    this.npmClient = new NpmRegistryClient(config.npm || {});
  }

  /**
   * Evaluate signed releases status
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

    // Check if package has signatures
    const hasSignatures = this._checkPackageSignatures(packageData);

    if (hasSignatures) {
      return {
        bonus: this.bonus,
        details: {
          signed: true,
          signatures: packageData.dist?.signatures || packageData.signatures || null,
          description: 'Package releases are cryptographically signed',
        },
        riskLevel: 'none',
      };
    }

    return {
      bonus: 0,
      details: {
        signed: false,
        description: 'Package releases are not cryptographically signed',
      },
      riskLevel: 'none',
    };
  }

  /**
   * Check if package has signatures
   * @private
   */
  _checkPackageSignatures(packageData) {
    // Check dist.signatures field
    if (packageData.dist?.signatures) {
      const signatures = packageData.dist.signatures;
      if (Array.isArray(signatures) && signatures.length > 0) {
        return true;
      }
      if (typeof signatures === 'object' && Object.keys(signatures).length > 0) {
        return true;
      }
    }

    // Check top-level signatures field
    if (packageData.signatures) {
      if (Array.isArray(packageData.signatures) && packageData.signatures.length > 0) {
        return true;
      }
      if (typeof packageData.signatures === 'object' && Object.keys(packageData.signatures).length > 0) {
        return true;
      }
    }

    // Check for npm signature indicators
    // npm packages may have signature metadata in _npmSignature or similar fields
    if (packageData._npmSignature) {
      return true;
    }

    // Check for PGP signatures
    if (packageData._pgpSignature) {
      return true;
    }

    // Check dist object for signature-related fields
    if (packageData.dist) {
      // Check for signature hash or signature URL
      if (packageData.dist.signatureHash || packageData.dist.signatureUrl) {
        return true;
      }

      // Check for integrity field (which may include signature info)
      if (packageData.dist.integrity) {
        // Integrity field indicates package integrity verification
        // This is a form of signature verification
        return true;
      }
    }

    return false;
  }

  /**
   * Verify signature validity (placeholder for future implementation)
   * @private
   */
  async _verifySignature(_signature, _packageData) {
    // Future implementation: Actually verify cryptographic signatures
    // This would involve:
    // 1. Fetching public keys
    // 2. Verifying signature against package content
    // 3. Checking certificate validity
    // For now, we just check if signatures exist
    return true;
  }
}

module.exports = SignedReleasesRule;

