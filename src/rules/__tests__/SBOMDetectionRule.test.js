const SBOMDetectionRule = require('../SBOMDetectionRule');
const TarballAnalyzer = require('../../utils/tarballAnalyzer');

// Mock TarballAnalyzer
jest.mock('../../utils/tarballAnalyzer');

describe('SBOMDetectionRule', () => {
  let rule;

  beforeEach(() => {
    rule = new SBOMDetectionRule(10);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create rule with default bonus', () => {
      const defaultRule = new SBOMDetectionRule();
      expect(defaultRule.bonus).toBe(10);
      expect(defaultRule.name).toBe('sbom-detection');
    });

    it('should create rule with custom bonus', () => {
      const customRule = new SBOMDetectionRule(15);
      expect(customRule.bonus).toBe(15);
    });

    it('should accept custom SBOM patterns', () => {
      const customPatterns = [/^custom-sbom\.json$/i];
      const customRule = new SBOMDetectionRule(10, { sbomPatterns: customPatterns });
      expect(customRule.sbomPatterns).toEqual(customPatterns);
    });
  });

  describe('evaluate', () => {
    it('should return no bonus for package without SBOM files', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        files: ['index.js', 'README.md'],
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.hasSBOM).toBe(false);
      expect(result.riskLevel).toBe('none');
    });

    it('should return bonus for package with spdx.json in files', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        files: ['index.js', 'spdx.json'],
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.hasSBOM).toBe(true);
      expect(result.details.sbomFiles.length).toBeGreaterThan(0);
      expect(result.riskLevel).toBe('none');
    });

    it('should return bonus for package with bom.json', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        files: ['index.js', 'bom.json'],
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.hasSBOM).toBe(true);
    });

    it('should return bonus for package with package-lock.json', async () => {
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        files: ['index.js', 'package-lock.json'],
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.hasSBOM).toBe(true);
    });

    it('should analyze tarball for SBOM files', async () => {
      const mockAnalysis = {
        fileStructure: [
          { type: 'file', path: 'package/index.js', size: 100 },
          { type: 'file', path: 'package/spdx.json', size: 200 },
        ],
      };

      const mockAnalyzer = {
        analyzeTarball: jest.fn().mockResolvedValue(mockAnalysis),
      };
      TarballAnalyzer.mockImplementation(() => mockAnalyzer);

      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        dist: {
          tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
        },
      };

      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(10);
      expect(result.details.hasSBOM).toBe(true);
      expect(result.details.sbomFiles.length).toBeGreaterThan(0);
    });

    it('should return no bonus when rule is disabled', async () => {
      rule.disable();
      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        files: ['spdx.json'],
      };
      const result = await rule.evaluate(packageData);

      expect(result.bonus).toBe(0);
      expect(result.details.reason).toBe('Rule is disabled');
    });

    it('should handle tarball analysis errors gracefully', async () => {
      const mockAnalyzer = {
        analyzeTarball: jest.fn().mockRejectedValue(new Error('Analysis failed')),
      };
      TarballAnalyzer.mockImplementation(() => mockAnalyzer);

      const packageData = {
        name: 'test-package',
        version: '1.0.0',
        dist: {
          tarball: 'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
        },
        files: ['index.js'],
      };

      const result = await rule.evaluate(packageData);

      // Should not throw, but return no bonus if no SBOM in files
      expect(result.bonus).toBe(0);
    });
  });

  describe('_isSBOMFile', () => {
    it('should detect spdx.json', () => {
      expect(rule._isSBOMFile('spdx.json')).toBe(true);
    });

    it('should detect bom.json', () => {
      expect(rule._isSBOMFile('bom.json')).toBe(true);
    });

    it('should detect package-lock.json', () => {
      expect(rule._isSBOMFile('package-lock.json')).toBe(true);
    });

    it('should detect cyclonedx.json', () => {
      expect(rule._isSBOMFile('cyclonedx.json')).toBe(true);
    });

    it('should detect .spdx files', () => {
      expect(rule._isSBOMFile('package.spdx')).toBe(true);
    });

    it('should not detect regular files', () => {
      expect(rule._isSBOMFile('index.js')).toBe(false);
      expect(rule._isSBOMFile('README.md')).toBe(false);
      expect(rule._isSBOMFile('package.json')).toBe(false);
    });

    it('should handle case-insensitive matching', () => {
      expect(rule._isSBOMFile('SPDX.JSON')).toBe(true);
      expect(rule._isSBOMFile('BOM.JSON')).toBe(true);
    });
  });
});

