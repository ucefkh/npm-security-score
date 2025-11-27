const ScoringService = require('../scoringService');
const config = require('../../utils/config');

// Mock dependencies
jest.mock('../../api/NpmRegistryClient');
jest.mock('../../utils/tarballAnalyzer');

const NpmRegistryClient = require('../../api/NpmRegistryClient');
const TarballAnalyzer = require('../../utils/tarballAnalyzer');

describe('ScoringService', () => {
  let service;
  let mockRegistryClient;
  let mockTarballAnalyzer;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock registry client
    mockRegistryClient = {
      getPackageMetadata: jest.fn(),
    };
    NpmRegistryClient.mockImplementation(() => mockRegistryClient);

    // Setup mock tarball analyzer
    mockTarballAnalyzer = {
      analyzeTarball: jest.fn(),
    };
    TarballAnalyzer.mockImplementation(() => mockTarballAnalyzer);

    service = new ScoringService({
      config: config.getAll(),
      verbose: false,
    });
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const defaultService = new ScoringService();
      expect(defaultService).toBeDefined();
      expect(defaultService.verbose).toBe(false);
    });

    it('should create service with custom options', () => {
      const customService = new ScoringService({
        verbose: true,
        config: { scoring: { baseScore: 50 } },
      });
      expect(customService.verbose).toBe(true);
    });
  });

  describe('createCalculator', () => {
    it('should create calculator with all enabled rules', () => {
      const calculator = service.createCalculator();
      expect(calculator).toBeDefined();
      const rules = calculator.getRules();
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should respect rule configuration', () => {
      const customConfig = {
        ...config.getAll(),
        rules: {
          lifecycleScriptRisk: { enabled: true, weight: 25 },
          externalNetworkCalls: { enabled: false },
          maintainerSecurity: { enabled: true, weight: 10 },
          obfuscatedCode: { enabled: false },
        },
      };
      const customService = new ScoringService({ config: customConfig });
      const calculator = customService.createCalculator();
      const rules = calculator.getRules();
      expect(rules.length).toBe(2);
    });
  });

  describe('fetchPackageData', () => {
    it('should fetch package metadata', async () => {
      const mockMetadata = {
        name: 'test-package',
        version: '1.0.0',
        dist: { tarball: 'https://example.com/package.tgz' },
      };

      mockRegistryClient.getPackageMetadata.mockResolvedValue(mockMetadata);
      mockTarballAnalyzer.analyzeTarball.mockResolvedValue({
        totalFiles: 10,
      });

      const result = await service.fetchPackageData('test-package');

      expect(mockRegistryClient.getPackageMetadata).toHaveBeenCalledWith(
        'test-package',
        null
      );
      expect(result.name).toBe('test-package');
      expect(result.version).toBe('1.0.0');
    });

    it('should fetch package with version', async () => {
      const mockMetadata = {
        name: 'test-package',
        version: '2.0.0',
      };

      mockRegistryClient.getPackageMetadata.mockResolvedValue(mockMetadata);

      await service.fetchPackageData('test-package', '2.0.0');

      expect(mockRegistryClient.getPackageMetadata).toHaveBeenCalledWith(
        'test-package',
        '2.0.0'
      );
    });

    it('should handle tarball analysis errors gracefully', async () => {
      const mockMetadata = {
        name: 'test-package',
        version: '1.0.0',
        dist: { tarball: 'https://example.com/package.tgz' },
      };

      mockRegistryClient.getPackageMetadata.mockResolvedValue(mockMetadata);
      mockTarballAnalyzer.analyzeTarball.mockRejectedValue(
        new Error('Network error')
      );

      const result = await service.fetchPackageData('test-package');

      expect(result).toBeDefined();
      expect(result.name).toBe('test-package');
    });
  });

  describe('scorePackage', () => {
    it('should score a package', async () => {
      const mockMetadata = {
        name: 'test-package',
        version: '1.0.0',
        scripts: {},
      };

      mockRegistryClient.getPackageMetadata.mockResolvedValue(mockMetadata);

      const result = await service.scorePackage('test-package');

      expect(result).toBeDefined();
      expect(result.packageName).toBe('test-package');
      expect(result.packageVersion).toBe('1.0.0');
      expect(result.score).toBeDefined();
      expect(result.band).toBeDefined();
    });

    it('should handle scoring errors', async () => {
      mockRegistryClient.getPackageMetadata.mockRejectedValue(
        new Error('Package not found')
      );

      await expect(service.scorePackage('nonexistent')).rejects.toThrow(
        'Package not found'
      );
    });
  });

  describe('scorePackages', () => {
    it('should score multiple packages', async () => {
      const mockMetadata1 = {
        name: 'package1',
        version: '1.0.0',
        scripts: {},
      };
      const mockMetadata2 = {
        name: 'package2',
        version: '2.0.0',
        scripts: {},
      };

      mockRegistryClient.getPackageMetadata
        .mockResolvedValueOnce(mockMetadata1)
        .mockResolvedValueOnce(mockMetadata2);

      const results = await service.scorePackages(['package1', 'package2']);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].result.packageName).toBe('package1');
      expect(results[1].result.packageName).toBe('package2');
    });

    it('should handle package with version', async () => {
      const mockMetadata = {
        name: 'package1',
        version: '2.0.0',
        scripts: {},
      };

      mockRegistryClient.getPackageMetadata.mockResolvedValue(mockMetadata);

      const results = await service.scorePackages(['package1@2.0.0']);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockRegistryClient.getPackageMetadata).toHaveBeenCalledWith(
        'package1',
        '2.0.0'
      );
    });

    it('should handle errors for individual packages', async () => {
      const mockMetadata = {
        name: 'package1',
        version: '1.0.0',
        scripts: {},
      };

      mockRegistryClient.getPackageMetadata
        .mockResolvedValueOnce(mockMetadata)
        .mockRejectedValueOnce(new Error('Package not found'));

      const results = await service.scorePackages(['package1', 'nonexistent']);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });
  });
});

