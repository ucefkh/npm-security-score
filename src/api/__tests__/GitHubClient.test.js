const GitHubClient = require('../GitHubClient');

describe('GitHubClient', () => {
  let client;

  beforeEach(() => {
    client = new GitHubClient();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      expect(client.baseUrl).toBe('https://api.github.com');
      expect(client.timeout).toBe(30000);
    });

    it('should accept custom config', () => {
      const custom = new GitHubClient({
        baseUrl: 'https://custom.github.com',
        token: 'test-token',
        timeout: 60000,
      });
      expect(custom.baseUrl).toBe('https://custom.github.com');
      expect(custom.token).toBe('test-token');
      expect(custom.timeout).toBe(60000);
    });

    it('should read token from environment', () => {
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'env-token';
      const clientWithEnv = new GitHubClient();
      expect(clientWithEnv.token).toBe('env-token');
      if (originalToken) {
        process.env.GITHUB_TOKEN = originalToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    });
  });

  describe('getUser', () => {
    it('should throw error if username is missing', async () => {
      await expect(client.getUser(null)).rejects.toThrow('Username is required');
    });

    // Note: Actual API calls would require network access
    // These would be better as integration tests
  });

  describe('getRepository', () => {
    it('should throw error if owner or repo is missing', async () => {
      await expect(client.getRepository(null, 'repo')).rejects.toThrow(
        'Owner and repo are required'
      );
      await expect(client.getRepository('owner', null)).rejects.toThrow(
        'Owner and repo are required'
      );
    });
  });

  describe('hasRateLimit', () => {
    it('should return true when rate limit is unknown', () => {
      expect(client.hasRateLimit()).toBe(true);
    });

    it('should return true when rate limit remaining > 0', () => {
      client.rateLimitRemaining = 10;
      expect(client.hasRateLimit()).toBe(true);
    });

    it('should return false when rate limit is 0', () => {
      client.rateLimitRemaining = 0;
      expect(client.hasRateLimit()).toBe(false);
    });
  });
});

