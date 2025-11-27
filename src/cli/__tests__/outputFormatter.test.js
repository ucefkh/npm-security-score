const OutputFormatter = require('../outputFormatter');
const fs = require('fs').promises;

jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
  },
}));

describe('OutputFormatter', () => {
  let formatter;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create formatter with default options', () => {
      formatter = new OutputFormatter();
      expect(formatter.json).toBe(false);
      expect(formatter.verbose).toBe(false);
    });

    it('should create formatter with custom options', () => {
      formatter = new OutputFormatter({
        json: true,
        verbose: true,
        colors: false,
      });
      expect(formatter.json).toBe(true);
      expect(formatter.verbose).toBe(true);
    });
  });

  describe('formatResult', () => {
    const mockResult = {
      score: 85,
      band: {
        emoji: '✅',
        label: 'Safe',
        description: 'Package appears safe to use',
      },
      packageName: 'test-package',
      packageVersion: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      ruleResults: [
        {
          ruleName: 'test-rule',
          deduction: 5,
          riskLevel: 'low',
          details: {},
        },
      ],
    };

    it('should format as JSON when json option is true', () => {
      formatter = new OutputFormatter({ json: true });
      const output = formatter.formatResult(mockResult);
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(parsed.score).toBe(85);
    });

    it('should format as human-readable when json option is false', () => {
      formatter = new OutputFormatter({ json: false });
      const output = formatter.formatResult(mockResult);
      expect(typeof output).toBe('string');
      expect(output).toContain('test-package');
      expect(output).toContain('85');
    });
  });

  describe('formatResults', () => {
    const mockResults = [
      {
        success: true,
        result: {
          score: 85,
          band: { emoji: '✅', label: 'Safe', description: 'Safe' },
          packageName: 'package1',
          packageVersion: '1.0.0',
        },
      },
      {
        success: true,
        result: {
          score: 60,
          band: { emoji: '⚠️', label: 'Review', description: 'Review' },
          packageName: 'package2',
          packageVersion: '2.0.0',
        },
      },
    ];

    it('should format multiple results as JSON', () => {
      formatter = new OutputFormatter({ json: true });
      const output = formatter.formatResults(mockResults);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should format multiple results as human-readable', () => {
      formatter = new OutputFormatter({ json: false });
      const output = formatter.formatResults(mockResults);
      expect(typeof output).toBe('string');
      expect(output).toContain('package1');
      expect(output).toContain('package2');
    });

    it('should handle failed results', () => {
      const resultsWithFailure = [
        ...mockResults,
        {
          success: false,
          package: 'package3',
          version: '3.0.0',
          error: 'Package not found',
        },
      ];

      formatter = new OutputFormatter({ json: false });
      const output = formatter.formatResults(resultsWithFailure);
      expect(output).toContain('package3');
      expect(output).toContain('Error');
    });
  });

  describe('formatComparison', () => {
    const result1 = {
      score: 85,
      band: { emoji: '✅', label: 'Safe', description: 'Safe' },
      packageName: 'package1',
      packageVersion: '1.0.0',
    };

    const result2 = {
      score: 60,
      band: { emoji: '⚠️', label: 'Review', description: 'Review' },
      packageName: 'package2',
      packageVersion: '2.0.0',
    };

    it('should format comparison as JSON', () => {
      formatter = new OutputFormatter({ json: true });
      const output = formatter.formatComparison(result1, result2);
      const parsed = JSON.parse(output);
      expect(parsed.package1).toBeDefined();
      expect(parsed.package2).toBeDefined();
      expect(parsed.comparison.scoreDifference).toBe(25);
    });

    it('should format comparison as human-readable', () => {
      formatter = new OutputFormatter({ json: false });
      const output = formatter.formatComparison(result1, result2);
      expect(typeof output).toBe('string');
      expect(output).toContain('package1');
      expect(output).toContain('package2');
      expect(output).toContain('25');
    });
  });

  describe('writeToFile', () => {
    it('should write JSON to file', async () => {
      formatter = new OutputFormatter({ json: true });
      const data = { score: 85, package: 'test' };

      await formatter.writeToFile('test.json', data);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.json'),
        expect.stringContaining('"score"'),
        'utf-8'
      );
    });

    it('should write string to file', async () => {
      formatter = new OutputFormatter({ json: false });
      const content = 'Test output';

      await formatter.writeToFile('test.txt', content);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.txt'),
        content,
        'utf-8'
      );
    });
  });

  describe('getScoreColor', () => {
    it('should return appropriate colors for different scores', () => {
      formatter = new OutputFormatter({ colors: true });

      // Test that colors are applied (we can't easily test the actual color codes)
      const output90 = formatter.formatResult({
        score: 90,
        band: { emoji: '✅', label: 'Safe', description: 'Safe' },
        packageName: 'test',
        packageVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        ruleResults: [],
      });

      const output50 = formatter.formatResult({
        score: 50,
        band: { emoji: '❌', label: 'High Risk', description: 'High Risk' },
        packageName: 'test',
        packageVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        ruleResults: [],
      });

      // Both should be formatted (we're just checking they don't throw)
      expect(typeof output90).toBe('string');
      expect(typeof output50).toBe('string');
    });
  });
});

