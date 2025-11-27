const CommunitySignalsRule = require('../CommunitySignalsRule');
const GitHubClient = require('../../api/GitHubClient');

// Mock GitHubClient
jest.mock('../../api/GitHubClient');

describe('CommunitySignalsRule', () => {
  let rule;
  let mockGitHubClient;

  beforeEach(() => {
    mockGitHubClient = {
      getRepository: jest.fn(),
      hasSecurityPolicy: jest.fn(),
      getRepositoryContents: jest.fn(),
      getCommits: jest.fn(),
      getIssues: jest.fn(),
      getPullRequests: jest.fn(),
    };

    GitHubClient.mockImplementation(() => mockGitHubClient);

    rule = new CommunitySignalsRule(5);
  });

  describe('constructor', () => {
    it('should create rule with default weight', () => {
      const defaultRule = new CommunitySignalsRule();
      expect(defaultRule.weight).toBe(5);
      expect(defaultRule.name).toBe('community-signals');
    });

    it('should create rule with custom weight', () => {
      const customRule = new CommunitySignalsRule(10);
      expect(customRule.weight).toBe(10);
    });

    it('should accept custom config', () => {
      const customRule = new CommunitySignalsRule(5, {
        inactiveThresholdDays: 365,
        lowActivityThresholdDays: 180,
      });
      expect(customRule.inactiveThresholdDays).toBe(365);
      expect(customRule.lowActivityThresholdDays).toBe(180);
    });
  });

  describe('evaluate', () => {
    it('should return no deduction for package without repository', async () => {
      const packageData = {};
      const result = await rule.evaluate(packageData);

      expect(result.deduction).toBe(0);
      expect(result.details.reason).toBe('No repository information found');
    });

    it('should detect inactive repository', async () => {
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 1); // 1 year ago

      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: oldDate.toISOString(),
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(false);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(result.deduction).toBeGreaterThan(0);
      expect(
        result.details.findings.some((f) => f.type === 'inactive-repo' || f.type === 'no-recent-commits')
      ).toBe(true);
    });

    it('should detect missing security policy', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(false);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'no-security-policy')
      ).toBe(true);
    });

    it('should not penalize if security policy exists', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'no-security-policy')
      ).toBe(false);
    });

    it('should detect archived repository', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: true,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

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

    it('should detect low commit activity', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 100); // 100 days ago

      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate.toISOString(),
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate.toISOString() } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some(
          (f) => f.type === 'low-commit-activity' || f.type === 'low-activity-repo'
        )
      ).toBe(true);
    });

    it('should detect no recent community activity', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'no-recent-community-activity')
      ).toBe(true);
    });

    it('should detect missing responsible disclosure in security policy', async () => {
      const recentDate = new Date().toISOString();
      const testContent = 'This is a general security policy document. Please contact us for security concerns.';
      const base64Content = Buffer.from(testContent).toString('base64');

      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepositoryContents.mockResolvedValue({
        content: base64Content,
        encoding: 'base64',
        name: 'SECURITY.md',
        path: 'SECURITY.md',
      });

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      
      // Verify getRepositoryContents was called
      expect(mockGitHubClient.getRepositoryContents).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        'SECURITY.md'
      );
      
      expect(
        result.details.findings.some((f) => f.type === 'no-responsible-disclosure')
      ).toBe(true);
    });

    it('should not flag security policy with responsible disclosure', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);
      mockGitHubClient.getRepositoryContents.mockResolvedValue({
        content: Buffer.from('Please report security issues to security@example.com via responsible disclosure').toString('base64'),
      });

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'no-responsible-disclosure')
      ).toBe(false);
    });

    it('should extract repository from string URL', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

      const packageData = {
        repository: 'https://github.com/test-owner/test-repo',
      };

      const result = await rule.evaluate(packageData);
      expect(result.details.repository.owner).toBe('test-owner');
      expect(result.details.repository.repo).toBe('test-repo');
    });

    it('should extract repository from homepage', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

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
      mockGitHubClient.getRepository.mockRejectedValue(new Error('API Error'));
      mockGitHubClient.getCommits.mockRejectedValue(new Error('API Error'));
      mockGitHubClient.hasSecurityPolicy.mockRejectedValue(new Error('API Error'));

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      // Should not throw, but may have some findings
      expect(result).toBeDefined();
    });

    it('should detect low community engagement', async () => {
      const recentDate = new Date().toISOString();
      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 2, // Very few stars
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue([]);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'low-community-engagement')
      ).toBe(true);
    });

    it('should detect many open issues', async () => {
      const recentDate = new Date().toISOString();
      const manyIssues = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        state: 'open',
        created_at: recentDate,
      }));

      mockGitHubClient.getRepository.mockResolvedValue({
        archived: false,
        disabled: false,
        pushed_at: recentDate,
        stargazers_count: 10,
      });
      mockGitHubClient.getCommits.mockResolvedValue([
        { commit: { author: { date: recentDate } } },
      ]);
      mockGitHubClient.getIssues.mockResolvedValue(manyIssues);
      mockGitHubClient.getPullRequests.mockResolvedValue([]);
      mockGitHubClient.hasSecurityPolicy.mockResolvedValue(true);

      const packageData = {
        repository: {
          url: 'https://github.com/test-owner/test-repo',
        },
      };

      const result = await rule.evaluate(packageData);
      expect(
        result.details.findings.some((f) => f.type === 'many-open-issues')
      ).toBe(true);
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

  describe('_checkResponsibleDisclosure', () => {
    it('should detect responsible disclosure keywords', () => {
      const content = 'Please report security issues via responsible disclosure to security@example.com';
      expect(rule._checkResponsibleDisclosure(content)).toBe(true);
    });

    it('should detect security email', () => {
      const content = 'Report vulnerabilities to security@example.com';
      expect(rule._checkResponsibleDisclosure(content)).toBe(true);
    });

    it('should detect vulnerability reporting', () => {
      const content = 'For vulnerability reporting, please contact us';
      expect(rule._checkResponsibleDisclosure(content)).toBe(true);
    });

    it('should return false if no keywords found', () => {
      const content = 'This is a general security policy without specific disclosure instructions';
      expect(rule._checkResponsibleDisclosure(content)).toBe(false);
    });

    it('should handle case-insensitive matching', () => {
      const content = 'RESPONSIBLE DISCLOSURE is important';
      expect(rule._checkResponsibleDisclosure(content)).toBe(true);
    });
  });
});

