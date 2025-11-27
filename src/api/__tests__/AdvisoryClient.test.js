const AdvisoryClient = require('../AdvisoryClient');

describe('AdvisoryClient', () => {
  let client;

  beforeEach(() => {
    client = new AdvisoryClient();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      expect(client.npmAdvisoryUrl).toContain('npmjs.org');
      expect(client.timeout).toBe(30000);
    });

    it('should accept custom config', () => {
      const custom = new AdvisoryClient({
        timeout: 60000,
        cacheTTL: 7200000,
      });
      expect(custom.timeout).toBe(60000);
      expect(custom.cacheTTL).toBe(7200000);
    });
  });

  describe('getAdvisories', () => {
    it('should throw error if package name is missing', async () => {
      await expect(client.getAdvisories(null)).rejects.toThrow('Package name is required');
    });

    // Note: Actual API calls would require network access
    // These would be better as integration tests
  });

  describe('_normalizeSeverity', () => {
    it('should normalize severity levels', () => {
      expect(client._normalizeSeverity('critical')).toBe('critical');
      expect(client._normalizeSeverity('HIGH')).toBe('high');
      expect(client._normalizeSeverity('moderate')).toBe('moderate');
      expect(client._normalizeSeverity('low')).toBe('low');
      expect(client._normalizeSeverity('9')).toBe('critical');
      expect(client._normalizeSeverity('7')).toBe('high');
      expect(client._normalizeSeverity('4')).toBe('moderate');
      expect(client._normalizeSeverity('1')).toBe('low');
    });
  });

  describe('_deduplicateAdvisories', () => {
    it('should remove duplicate advisories', () => {
      const advisories = [
        { id: 'adv-1', title: 'Advisory 1' },
        { id: 'adv-2', title: 'Advisory 2' },
        { id: 'adv-1', title: 'Advisory 1 Duplicate' },
      ];

      const unique = client._deduplicateAdvisories(advisories);
      expect(unique).toHaveLength(2);
      expect(unique[0].id).toBe('adv-1');
      expect(unique[1].id).toBe('adv-2');
    });
  });

  describe('clearCache', () => {
    it('should clear cache', () => {
      client.cache.set('test', { data: [], timestamp: Date.now() });
      expect(client.cache.size).toBe(1);

      client.clearCache();
      expect(client.cache.size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      client.cache.set('test1', { data: [], timestamp: Date.now() });
      client.cache.set('test2', { data: [], timestamp: Date.now() });

      const stats = client.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.entries).toContain('test1');
      expect(stats.entries).toContain('test2');
    });
  });
});

