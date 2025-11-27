const MarkdownFormatter = require('../markdownFormatter');

describe('MarkdownFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new MarkdownFormatter();
  });

  describe('format', () => {
    it('should format result as markdown', () => {
      const result = {
        packageName: 'test-package',
        packageVersion: '1.0.0',
        score: 85,
        band: {
          key: 'REVIEW',
          label: 'Review Recommended',
          description: 'Review recommended before use',
          emoji: '⚠️',
        },
        ruleResults: [],
        timestamp: new Date().toISOString(),
      };

      const markdown = formatter.format(result);
      expect(markdown).toContain('# Security Score Report');
      expect(markdown).toContain('test-package@1.0.0');
      expect(markdown).toContain('85/100');
    });

    it('should include rule results in markdown', () => {
      const result = {
        packageName: 'test-package',
        packageVersion: '1.0.0',
        score: 70,
        band: {
          key: 'REVIEW',
          label: 'Review Recommended',
          description: 'Review recommended',
          emoji: '⚠️',
        },
        ruleResults: [
          {
            ruleName: 'lifecycle-script-risk',
            deduction: 30,
            riskLevel: 'high',
            details: {
              findings: [
                {
                  hook: 'postinstall',
                  description: 'Suspicious script detected',
                },
              ],
            },
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const markdown = formatter.format(result);
      expect(markdown).toContain('## Security Analysis');
      expect(markdown).toContain('Lifecycle Script Risk'); // Formatted name
      expect(markdown).toContain('postinstall');
    });

    it('should include recommendations', () => {
      const result = {
        packageName: 'test-package',
        packageVersion: '1.0.0',
        score: 45,
        band: {
          key: 'BLOCK',
          label: 'Block',
          description: 'Block in CI/CD',
          emoji: '🚨',
        },
        ruleResults: [
          {
            ruleName: 'advisory-history',
            deduction: 15,
            riskLevel: 'high',
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const markdown = formatter.format(result);
      expect(markdown).toContain('## Recommendations');
      expect(markdown).toContain('Update Package');
    });
  });

  describe('_formatSummary', () => {
    it('should format summary table', () => {
      const result = {
        score: 85,
        band: {
          emoji: '⚠️',
          label: 'Review Recommended',
        },
        ruleResults: [
          { deduction: 15 },
          { deduction: 0 },
        ],
      };

      const summary = formatter._formatSummary(result);
      expect(summary).toContain('Security Score');
      expect(summary).toContain('85/100');
      expect(summary).toContain('Issues Found');
    });
  });

  describe('_generateScoreBar', () => {
    it('should generate score bar', () => {
      const bar = formatter._generateScoreBar(85);
      expect(bar).toContain('85%');
      expect(bar.length).toBeGreaterThan(0);
    });

    it('should handle edge cases', () => {
      expect(formatter._generateScoreBar(0)).toContain('0%');
      expect(formatter._generateScoreBar(100)).toContain('100%');
    });
  });
});

