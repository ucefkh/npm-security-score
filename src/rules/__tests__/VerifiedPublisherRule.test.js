const VerifiedPublisherRule = require('../VerifiedPublisherRule');

describe('VerifiedPublisherRule', () => {
  let rule;

  beforeEach(() => {
    rule = new VerifiedPublisherRule(10);
  });

  describe('constructor', () => {
    it('should create rule with default bonus', () => {
      const defaultRule = new VerifiedPublisherRule();
      expect(defaultRule.bonus).toBe(10);
      expect(defaultRule.name).toBe('verified-publisher');
    });

    it('should create rule with custom bonus', () => {
      const customRule = new VerifiedPublisherRule(15);
      expect(customRule.bonus).toBe(15);
    });
  });

  describe('evaluate', () => {
    it('should return no bonus for package without verified publisher', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.verified).toBe(false);
      expect(result.riskLevel).toBe('none');
    });

    it('should return bonus for verified publisher', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        publisher: {
          verified: true,
          name: 'verified-publisher',
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.verified).toBe(true);
      expect(result.riskLevel).toBe('none');
    });

    it('should return no bonus for unverified publisher', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        publisher: {
          verified: false,
          name: 'unverified-publisher',
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.verified).toBe(false);
    });

    it('should return no bonus when rule is disabled', async () => {
      rule.disable();
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        publisher: {
          verified: true,
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.reason).toBe('Rule is disabled');
    });

    it('should handle scoped packages', async () => {
      const packageData = {
        name: '@scope/test-package',
        version: '1.0.0',
        publisher: {
          verified: true,
        },
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.verified).toBe(true);
    });
  });

  describe('_checkVerifiedPublisher', () => {
    it('should detect verified publisher', () => {
      const packageData = {
        publisher: {
          verified: true,
        },
      };
      const isVerified = rule._checkVerifiedPublisher(packageData);
      expect(isVerified).toBe(true);
    });

    it('should not detect unverified publisher', () => {
      const packageData = {
        publisher: {
          verified: false,
        },
      };
      const isVerified = rule._checkVerifiedPublisher(packageData);
      expect(isVerified).toBe(false);
    });

    it('should handle missing publisher field', () => {
      const packageData = {};
      const isVerified = rule._checkVerifiedPublisher(packageData);
      expect(isVerified).toBe(false);
    });
  });
});

