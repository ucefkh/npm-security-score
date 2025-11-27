const MaintainerSecurityRule = require('../MaintainerSecurityRule');
const GitHubClient = require('../../api/GitHubClient');

// Mock GitHubClient
jest.mock('../../api/GitHubClient');

describe('MaintainerSecurityRule', () => {
  let rule;
  let mockGitHubClient;

  beforeEach(() => {
    mockGitHubClient = {
      getUser: jest.fn(),
      getRepository: jest.fn(),
      hasSecurityPolicy: jest.fn(),
    };

    GitHubClient.mockImplementation(() => mockGitHubClient);

    rule = new MaintainerSecurityRule(15);
  });

  describe('constructor', () => {
    it('should create rule with default weight', () => {
      const defaultRule = new MaintainerSecurityRule();
      expect(defaultRule.weight).toBe(15);
      expect(defaultRule.name).toBe('maintainer-security');
    });

    it('should create rule with custom weight', () => {
      const customRule = new MaintainerSecurityRule(20);
      expect(customRule.weight).toBe(20);
    });
  });

  describe('evaluate', () => {
    it('should return no deduction for package without repository', async () => {
      const packageData = {};
      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBe(0);
      expect(result.details.reason).toBe('No repository information found');
    });

    it('should detect missing security policy', async () => {
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(false);
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: new Date().toISOString(),
      });

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBeGreaterThan(0);
      expect(
        result.details.findings.some((f) => f.type === 'no-security-policy')
      ).toBe(true);
    });

    it('should not penalize if security policy exists', async () => {
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: new Date().toISOString(),
      });

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
        author: {
          name: 'test-author',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'no-security-policy')
      ).toBe(false);
    });

    it('should detect archived repository', async () => {
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: true,
        disabled: false,
        pushed_at: new Date().toISOString(),
      });

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'archived-repo')
      ).toBe(true);
    });

    it('should detect inactive repository', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 2); // 2 years ago

      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: oldDate.toISOString(),
      });

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'inactive-repo')
      ).toBe(true);
    });

    it('should extract repository from string URL', async () => {
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: new Date().toISOString(),
      });

      const packageData = {
        repository: 'https://github.com/test-owner/test-repo',
      };

      const result = await rule.evaluate(packageData);
      expect(result.details.repository.owner).toBe('test-owner');
      expect(result.details.repository.repo).toBe('test-repo');
    });

    it('should extract repository from homepage', async () => {
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: new Date().toISOString(),
      });

      const packageData = {
        homepage: 'https://github.com/test-owner/test-repo',
      };

      const result = await rule.evaluate(packageData);
      expect(result.details.repository.owner).toBe('test-owner');
      expect(result.details.repository.repo).toBe('test-repo');
    });

    it('should return no deduction when rule is disabled', async () => {
      rule.disable();
      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBe(0);
      expect(result.details.reason).toBe('Rule is disabled');
    });

    it('should handle API errors gracefully', async () => {
      mockGitHubClient.hasSecurityPolicy.mockRejectedValue(
        new Error('API Error')
      );
      mockGitHubClient.getRepository.mockRejectedValue(new Error('API Error'));

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      // Should not throw, but may have some findings
      expect(result).toBeDefined();
    });
  });

  describe('_extractRepository', () => {
    it('should extract from repository.url', () => {
      const packageData = {
        repository: {
          url: 'https://github.com/owner/repo',
        },
      };

      const repo = rule._extractRepository(packageData);
      expect(repo.owner).toBe('owner');
      expect(repo.repo).toBe('repo');
    });

    it('should extract from repository string', () => {
      const packageData = {
        repository: 'https://github.com/owner/repo',
      };

      const repo = rule._extractRepository(packageData);
      expect(repo.owner).toBe('owner');
      expect(repo.repo).toBe('repo');
    });

    it('should extract from homepage', () => {
      const packageData = {
        homepage: 'https://github.com/owner/repo',
      };

      const repo = rule._extractRepository(packageData);
      expect(repo.owner).toBe('owner');
      expect(repo.repo).toBe('repo');
    });

    it('should return null if no repository found', () => {
      const packageData = {};
      expect(rule._extractRepository(packageData)).toBeNull();
    });
  });

  describe('_extractMaintainers', () => {
    it('should extract from maintainers array', () => {
      const packageData = {
        maintainers: [
          { name: 'maintainer1', email: 'm1@example.com' },
          { name: 'maintainer2' },
        ],
      };

      const maintainers = rule._extractMaintainers(packageData);
      expect(maintainers).toHaveLength(2);
      expect(maintainers[0].name).toBe('maintainer1');
    });

    it('should extract from author', () => {
      const packageData = {
        author: {
          name: 'author-name',
          email: 'author@example.com',
        },
      };

      const maintainers = rule._extractMaintainers(packageData);
      expect(maintainers).toHaveLength(1);
      expect(maintainers[0].name).toBe('author-name');
    });
  });

  describe('_calculateAccountAge', () => {
    it('should calculate account age in days', () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const age = rule._calculateAccountAge(thirtyDaysAgo.toISOString());
      expect(age).toBeGreaterThanOrEqual(29);
      expect(age).toBeLessThanOrEqual(31);
    });
  });
});

