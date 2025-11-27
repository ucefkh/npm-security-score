/**
 * Configuration management system
 * Supports JSON/YAML config files and environment variables
 */

const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CONFIG = {
  scoring: {
    baseScore: 100,
    minScore: 0,
    maxScore: 100,
  },
  rules: {
    lifecycleScriptRisk: {
      enabled: true,
      weight: 30,
    },
    externalNetworkCalls: {
      enabled: true,
      weight: 20,
    },
    maintainerSecurity: {
      enabled: true,
      weight: 15,
    },
    obfuscatedCode: {
      enabled: true,
      weight: 10,
    },
    advisoryHistory: {
      enabled: true,
      weight: 15,
    },
    updateBehavior: {
      enabled: true,
      weight: 10,
    },
    communitySignals: {
      enabled: true,
      weight: 5,
    },
    // Bonus rules
    verifiedPublisher: {
      enabled: true,
      bonus: 10,
    },
    signedReleases: {
      enabled: true,
      bonus: 10,
    },
    sbomDetection: {
      enabled: true,
      bonus: 10,
    },
  },
  api: {
    npm: {
      registry: 'https://registry.npmjs.org',
      timeout: 30000,
    },
    github: {
      baseUrl: 'https://api.github.com',
      timeout: 30000,
    },
  },
  cache: {
    enabled: true,
    ttl: 3600000, // 1 hour in milliseconds
  },
};

class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = null;
  }

  /**
   * Load configuration from file
   * @param {string} configPath - Path to config file (JSON or YAML)
   * @returns {Promise<Object>} Loaded configuration
   */
  async loadFromFile(configPath) {
    try {
      const fullPath = path.resolve(configPath);
      const content = await fs.readFile(fullPath, 'utf-8');
      const ext = path.extname(fullPath).toLowerCase();

      let fileConfig;
      if (ext === '.json') {
        fileConfig = JSON.parse(content);
      } else if (ext === '.yaml' || ext === '.yml') {
        // YAML support would require yaml package
        // For now, we'll just support JSON
        throw new Error('YAML support requires yaml package. Use JSON for now.');
      } else {
        throw new Error(`Unsupported config file format: ${ext}`);
      }

      this.config = this.mergeConfig(this.config, fileConfig);
      this.configPath = fullPath;
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Config file not found: ${configPath}`);
      }
      throw error;
    }
  }

  /**
   * Load configuration from environment variables
   * Environment variables should be prefixed with NPM_SECURITY_SCORE_
   * Example: NPM_SECURITY_SCORE_SCORING_BASE_SCORE=100
   */
  loadFromEnv() {
    const envConfig = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('NPM_SECURITY_SCORE_')) {
        const configKey = key
          .replace('NPM_SECURITY_SCORE_', '')
          .toLowerCase()
          .split('_')
          .reduce((acc, part, index) => {
            if (index === 0) {
              return part;
            }
            return acc + part.charAt(0).toUpperCase() + part.slice(1);
          }, '');

        // Simple parsing - could be enhanced
        let parsedValue = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (!isNaN(value) && value !== '') parsedValue = Number(value);

        this.setNestedProperty(envConfig, configKey, parsedValue);
      }
    }

    if (Object.keys(envConfig).length > 0) {
      this.config = this.mergeConfig(this.config, envConfig);
    }

    return this.config;
  }

  /**
   * Set nested property in object
   * @private
   */
  setNestedProperty(obj, path, value) {
    const keys = path.split(/(?=[A-Z])/).map((k) => k.toLowerCase());
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Merge two configuration objects
   * @private
   */
  mergeConfig(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };

    for (const [key, value] of Object.entries(userConfig)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeConfig(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Get configuration value
   * @param {string} path - Dot-separated path to config value (e.g., 'scoring.baseScore')
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Configuration value
   */
  get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Set configuration value
   * @param {string} path - Dot-separated path to config value
   * @param {*} value - Value to set
   */
  set(path, value) {
    const keys = path.split('.');
    let current = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Get full configuration
   * @returns {Object} Full configuration object
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Validate configuration
   * @returns {Object} Validation result with isValid and errors
   */
  validate() {
    const errors = [];

    // Validate scoring config
    const baseScore = this.get('scoring.baseScore');
    if (typeof baseScore !== 'number' || baseScore < 0) {
      errors.push('scoring.baseScore must be a non-negative number');
    }

    const minScore = this.get('scoring.minScore');
    const maxScore = this.get('scoring.maxScore');
    if (minScore >= maxScore) {
      errors.push('scoring.minScore must be less than scoring.maxScore');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
const configManager = new ConfigManager();

// Load from environment on initialization
configManager.loadFromEnv();

module.exports = configManager;
module.exports.ConfigManager = ConfigManager;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;

