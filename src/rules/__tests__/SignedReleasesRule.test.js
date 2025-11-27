const SignedReleasesRule = require('../SignedReleasesRule');

describe('SignedReleasesRule', () => {
  let rule;

  beforeEach(() => {
    rule = new SignedReleasesRule(10);
  });

  describe('constructor', () => {
    it('should create rule with default bonus', () => {
      const defaultRule = new SignedReleasesRule();
      expect(defaultRule.bonus).toBe(10);
      expect(defaultRule.name).toBe('signed-releases');
    });

    it('should create rule with custom bonus', () => {
      const customRule = new SignedReleasesRule(15);
      expect(customRule.bonus).toBe(15);
    });
  });

  describe('evaluate', () => {
    it('should return no bonus for package without signatures', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        dist: {
          tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.signed).toBe(false);
      expect(result.riskLevel).toBe('none');
    });

    it('should return bonus for package with dist signatures', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        dist: {
          tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
          signatures: [
            {
              keyid: 'key-id',
              sig: 'signature-data',
            },
          ],
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.signed).toBe(true);
      expect(result.details.signatures).toBeDefined();
      expect(result.riskLevel).toBe('none');
    });

    it('should return bonus for package with top-level signatures', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        signatures: {
          keyid: 'key-id',
          sig: 'signature-data',
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.signed).toBe(true);
    });

    it('should return bonus for package with integrity field', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        dist: {
          tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
          integrity: 'sha512-abc123...',
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.signed).toBe(true);
    });

    it('should return bonus for package with _npmSignature', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        _npmSignature: 'signature-data',
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.signed).toBe(true);
    });

    it('should return bonus for package with _pgpSignature', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        _pgpSignature: 'pgp-signature-data',
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.signed).toBe(true);
    });

    it('should return no bonus when rule is disabled', async () => {
      rule.disable();
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        dist: {
          signatures: [{ keyid: 'key-id', sig: 'sig' }],
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.reason).toBe('Rule is disabled');
    });
  });

  describe('_checkPackageSignatures', () => {
    it('should detect array signatures in dist', () => {
      const packageData = {
        dist: {
          signatures: [{ keyid: 'key', sig: 'sig' }],
        },
      };
      const hasSignatures = rule._checkPackageSignatures(packageData);
      expect(hasSignatures).toBe(true);
    });

    it('should detect object signatures in dist', () => {
      const packageData = {
        dist: {
          signatures: { keyid: 'key', sig: 'sig' },
        },
      };
      const hasSignatures = rule._checkPackageSignatures(packageData);
      expect(hasSignatures).toBe(true);
    });

    it('should detect integrity field', () => {
      const packageData = {
        dist: {
          integrity: 'sha512-abc123',
        },
      };
      const hasSignatures = rule._checkPackageSignatures(packageData);
      expect(hasSignatures).toBe(true);
    });

    it('should not detect signatures when none exist', () => {
      const packageData = {
        dist: {
          tarball: 'https://example.com/package.tgz',
        },
      };
      const hasSignatures = rule._checkPackageSignatures(packageData);
      expect(hasSignatures).toBe(false);
    });
  });
});

