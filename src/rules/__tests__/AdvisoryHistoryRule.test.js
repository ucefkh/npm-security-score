const AdvisoryHistoryRule = require('../AdvisoryHistoryRule');
const AdvisoryClient = require('../../api/AdvisoryClient');

// Mock AdvisoryClient
jest.mock('../../api/AdvisoryClient');

describe('AdvisoryHistoryRule', () => {
  let rule;
  let mockAdvisoryClient;

  beforeEach(() => {
    mockAdvisoryClient = {
      getAdvisories: jest.fn(),
    };

    AdvisoryClient.mockImplementation(() => mockAdvisoryClient);

    rule = new AdvisoryHistoryRule(15);
  });

  describe('constructor', () => {
    it('should create rule with default weight', () => {
      const defaultRule = new AdvisoryHistoryRule();
      expect(defaultRule.weight).toBe(15);
      expect(defaultRule.name).toBe('advisory-history');
    });

    it('should create rule with custom weight', () => {
      const customRule = new AdvisoryHistoryRule(20);
      expect(customRule.weight).toBe(20);
    });
  });

  describe('evaluate', () => {
    it('should return no deduction for package without advisories', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([]);

      const packageData = {
        name: 'test-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('none');
      expect(result.details.totalAdvisories).toBe(0);
    });

    it('should detect malware history', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'malware-1',
          title: 'Malware detected',
          severity: 'critical',
          isMalware: true,
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'malware-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(15); // Full deduction for malware
      expect(result.riskLevel).toBe('high');
      expect(result.details.analysis.hasMalware).toBe(true);
    });

    it('should detect critical advisories', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'cve-2023-1234',
          title: 'Critical vulnerability',
          severity: 'critical',
          cve: 'CVE-2023-1234',
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'vulnerable-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(13); // 90% of 15
      expect(result.riskLevel).toBe('high');
      expect(result.details.analysis.criticalCount).toBe(1);
    });

    it('should detect high severity advisories', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'cve-2023-5678',
          title: 'High severity vulnerability',
          severity: 'high',
          cve: 'CVE-2023-5678',
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'vulnerable-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(11); // 75% of 15
      expect(result.riskLevel).toBe('medium');
    });

    it('should detect moderate severity advisories', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'cve-2023-9012',
          title: 'Moderate vulnerability',
          severity: 'moderate',
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'vulnerable-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(7); // 50% of 15
      expect(result.riskLevel).toBe('medium');
    });

    it('should detect low severity advisories', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'cve-2023-3456',
          title: 'Low severity issue',
          severity: 'low',
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'vulnerable-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(3); // 25% of 15
      expect(result.riskLevel).toBe('low');
    });

    it('should handle multiple advisories', async () => {
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'cve-1',
          title: 'Critical vulnerability',
          severity: 'critical',
          source: 'npm',
        },
        {
          id: 'cve-2',
          title: 'High vulnerability',
          severity: 'high',
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'vulnerable-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.details.totalAdvisories).toBe(2);
      expect(result.details.analysis.criticalCount).toBe(1);
      expect(result.details.analysis.highCount).toBe(1);
    });

    it('should handle API errors gracefully', async () => {
      mockAdvisoryClient.getAdvisories.mockRejectedValue(new Error('API Error'));

      const packageData = {
        name: 'test-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('error');
      expect(result.details.error).toBeDefined();
    });

    it('should return no deduction when rule is disabled', async () => {
      rule.disable();
      mockAdvisoryClient.getAdvisories.mockResolvedValue([
        {
          id: 'cve-1',
          severity: 'critical',
          source: 'npm',
        },
      ]);

      const packageData = {
        name: 'test-package',
        version: '1.0.0',
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(0);
      expect(result.details.reason).toBe('Rule is disabled');
    });

    it('should return no deduction if package name is missing', async () => {
      const result = await rule.evaluate({});
      expect(result.deduction).toBe(0);
      expect(result.details.reason).toBe('Package name is required');
    });
  });

  describe('_analyzeAdvisories', () => {
    it('should analyze advisories correctly', () => {
      const advisories = [
        {
          severity: 'critical',
          isMalware: false,
          cve: 'CVE-2023-1234',
          published: new Date().toISOString(),
        },
        {
          severity: 'high',
          isMalware: false,
          cve: null,
          published: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
        },
      ];

      const analysis = rule._analyzeAdvisories(advisories, '1.0.0');
      expect(analysis.total).toBe(2);
      expect(analysis.criticalCount).toBe(1);
      expect(analysis.highCount).toBe(1);
      expect(analysis.cveCount).toBe(1);
      expect(analysis.recentAdvisories).toBe(1); // Only the recent one
    });
  });

  describe('_calculateRiskLevel', () => {
    it('should return high risk for malware', () => {
      const analysis = { hasMalware: true, criticalCount: 0 };
      expect(rule._calculateRiskLevel(analysis)).toBe('high');
    });

    it('should return high risk for critical advisories', () => {
      const analysis = { hasMalware: false, criticalCount: 1 };
      expect(rule._calculateRiskLevel(analysis)).toBe('high');
    });

    it('should return medium risk for high severity', () => {
      const analysis = { hasMalware: false, criticalCount: 0, highCount: 1 };
      expect(rule._calculateRiskLevel(analysis)).toBe('medium');
    });

    it('should return low risk for low severity', () => {
      const analysis = { hasMalware: false, criticalCount: 0, highCount: 0, lowCount: 1 };
      expect(rule._calculateRiskLevel(analysis)).toBe('low');
    });
  });
});

