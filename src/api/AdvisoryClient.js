/**
 * Advisory Database Client
 * Fetches security advisories from multiple sources
 */

const https = require('https');

class AdvisoryClient {
  constructor(config = {}) {
    this.npmAdvisoryUrl = config.npmAdvisoryUrl || 'https://registry.npmjs.org/-/npm/v1/security/advisories';
    this.githubAdvisoryUrl = config.githubAdvisoryUrl || 'https://api.github.com/advisories';
    this.timeout = config.timeout || 30000;
    this.cache = new Map();
    this.cacheTTL = config.cacheTTL || 3600000; // 1 hour default
  }

  /**
   * Get advisories for a package
   * @param {string} packageName - Package name
   * @param {string} version - Package version (optional)
   * @returns {Promise<Array>} Array of advisories
   */
  async getAdvisories(packageName, version = null) {
    if (!packageName) {
      throw new Error('Package name is required');
    }

    const cacheKey = `${packageName}@${version || 'latest'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const advisories = [];

    // Fetch from npm advisory API
    try {
      const npmAdvisories = await this._getNpmAdvisories(packageName, version);
      advisories.push(...npmAdvisories);
    } catch (error) {
      // Log but continue with other sources
      // eslint-disable-next-line no-console
      console.warn(`Failed to fetch npm advisories: ${error.message}`);
    }

    // Fetch from GitHub Security Advisory API
    try {
      const githubAdvisories = await this._getGitHubAdvisories(packageName);
      advisories.push(...githubAdvisories);
    } catch (error) {
      // Log but continue
      // eslint-disable-next-line no-console
      console.warn(`Failed to fetch GitHub advisories: ${error.message}`);
    }

    // Deduplicate advisories by ID
    const uniqueAdvisories = this._deduplicateAdvisories(advisories);

    // Cache results
    this.cache.set(cacheKey, {
      data: uniqueAdvisories,
      timestamp: Date.now(),
    });

    return uniqueAdvisories;
  }

  /**
   * Get npm advisories
   * @private
   */
  async _getNpmAdvisories(packageName, version) {
    // npm advisory API endpoint
    // Note: This is a simplified implementation
    // The actual npm advisory API may have different endpoints
    const url = `${this.npmAdvisoryUrl}?package=${encodeURIComponent(packageName)}`;

    try {
      const data = await this._fetch(url);
      if (Array.isArray(data)) {
        return data.map((adv) => this._normalizeNpmAdvisory(adv, packageName, version));
      }
      return [];
    } catch (error) {
      if (error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get GitHub Security Advisories
   * @private
   */
  async _getGitHubAdvisories(packageName) {
    // GitHub Security Advisory API
    // Note: This requires authentication for full access
    // Public endpoint may have limited data
    const url = `${this.githubAdvisoryUrl}?package=${encodeURIComponent(packageName)}`;

    try {
      const data = await this._fetch(url);
      if (data && Array.isArray(data)) {
        return data.map((adv) => this._normalizeGitHubAdvisory(adv, packageName));
      }
      return [];
    } catch (error) {
      if (error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Normalize npm advisory format
   * @private
   */
  _normalizeNpmAdvisory(advisory, packageName, version) {
    return {
      id: advisory.id || advisory.cve || `npm-${packageName}-${Date.now()}`,
      source: 'npm',
      package: packageName,
      version: version,
      title: advisory.title || advisory.summary || 'Security Advisory',
      severity: this._normalizeSeverity(advisory.severity),
      cvss: advisory.cvss || null,
      cwe: advisory.cwe || null,
      cve: advisory.cve || null,
      description: advisory.description || '',
      url: advisory.url || advisory.references?.[0] || null,
      published: advisory.published || advisory.created || null,
      updated: advisory.updated || advisory.modified || null,
      vulnerableVersions: advisory.vulnerableVersions || advisory.affected || '*',
      patchedVersions: advisory.patchedVersions || advisory.fixed || null,
      isMalware: advisory.type === 'malware' || advisory.malware === true,
    };
  }

  /**
   * Normalize GitHub advisory format
   * @private
   */
  _normalizeGitHubAdvisory(advisory, packageName) {
    return {
      id: advisory.ghsa_id || advisory.id || `ghsa-${packageName}-${Date.now()}`,
      source: 'github',
      package: packageName,
      version: null,
      title: advisory.summary || advisory.title || 'Security Advisory',
      severity: this._normalizeSeverity(advisory.severity),
      cvss: advisory.cvss_score || null,
      cwe: advisory.cwe || null,
      cve: advisory.cve_id || advisory.cve || null,
      description: advisory.description || '',
      url: advisory.html_url || advisory.url || null,
      published: advisory.published_at || advisory.created_at || null,
      updated: advisory.updated_at || advisory.modified_at || null,
      vulnerableVersions: advisory.vulnerable_version_range || '*',
      patchedVersions: advisory.patched_versions || null,
      isMalware: false, // GitHub advisories typically don't include malware
    };
  }

  /**
   * Normalize severity levels
   * @private
   */
  _normalizeSeverity(severity) {
    if (!severity) return 'unknown';

    const normalized = severity.toLowerCase();
    if (normalized.includes('critical') || normalized === '9' || normalized === '10') {
      return 'critical';
    }
    if (normalized.includes('high') || normalized === '7' || normalized === '8') {
      return 'high';
    }
    if (normalized.includes('moderate') || normalized.includes('medium') || normalized === '4' || normalized === '5' || normalized === '6') {
      return 'moderate';
    }
    if (normalized.includes('low') || normalized === '1' || normalized === '2' || normalized === '3') {
      return 'low';
    }
    return 'unknown';
  }

  /**
   * Deduplicate advisories by ID
   * @private
   */
  _deduplicateAdvisories(advisories) {
    const seen = new Set();
    const unique = [];

    for (const advisory of advisories) {
      const key = advisory.id || `${advisory.source}-${advisory.cve || advisory.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(advisory);
      }
    }

    return unique;
  }

  /**
   * Fetch data from URL
   * @private
   */
  _fetch(url) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              const parsed = data ? JSON.parse(data) : {};
              resolve(parsed);
            } catch (error) {
              reject(new Error(`Failed to parse JSON: ${error.message}`));
            }
          } else if (response.statusCode === 404) {
            resolve(null);
          } else {
            const error = new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
            error.statusCode = response.statusCode;
            reject(error);
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(this.timeout, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

module.exports = AdvisoryClient;

