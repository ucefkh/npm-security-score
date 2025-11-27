/**
 * GitHub API client
 * Handles authentication, rate limiting, and API requests
 */

const https = require('https');

class GitHubClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'https://api.github.com';
    this.token = config.token || process.env.GITHUB_TOKEN;
    this.timeout = config.timeout || 30000;
    this.rateLimitRemaining = null;
    this.rateLimitReset = null;
  }

  /**
   * Make a request to GitHub API
   * @private
   */
  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'User-Agent': 'npm-security-score',
      Accept: 'application/vnd.github.v3+json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `token ${this.token}`;
    }

    return new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers,
          timeout: this.timeout,
        },
        (response) => {
          // Handle rate limiting
          const rateLimitRemaining = response.headers['x-ratelimit-remaining'];
          const rateLimitReset = response.headers['x-ratelimit-reset'];

          if (rateLimitRemaining !== undefined) {
            this.rateLimitRemaining = parseInt(rateLimitRemaining, 10);
          }
          if (rateLimitReset !== undefined) {
            this.rateLimitReset = parseInt(rateLimitReset, 10);
          }

          let data = '';

          response.on('data', (chunk) => {
            data += chunk;
          });

          response.on('end', () => {
            if (response.statusCode === 403 && this.rateLimitRemaining === 0) {
              const resetTime = new Date(this.rateLimitReset * 1000);
              reject(
                new Error(
                  `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}`
                )
              );
              return;
            }

            if (response.statusCode >= 200 && response.statusCode < 300) {
              try {
                const parsed = data ? JSON.parse(data) : {};
                resolve(parsed);
              } catch (error) {
                reject(new Error(`Failed to parse JSON: ${error.message}`));
              }
            } else if (response.statusCode === 404) {
              resolve(null); // Not found is not an error for our use case
            } else {
              const error = new Error(
                `GitHub API error: ${response.statusCode} ${response.statusMessage}`
              );
              error.statusCode = response.statusCode;
              reject(error);
            }
          });
        }
      );

      request.on('error', (error) => {
        reject(error);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Get user information
   * @param {string} username - GitHub username
   * @returns {Promise<Object>} User information
   */
  async getUser(username) {
    if (!username) {
      throw new Error('Username is required');
    }

    try {
      return await this._request(`/users/${username}`);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if user has 2FA enabled
   * Note: This requires organization membership or special permissions
   * For public repos, we can check organization members
   * @param {string} username - GitHub username
   * @param {string} _org - Organization name (optional, not currently used)
   * @returns {Promise<boolean|null>} True if 2FA enabled, false if not, null if unknown
   */
  async check2FAStatus(username, _org = null) {
    // Note: GitHub API doesn't directly expose 2FA status for public users
    // This would require organization membership or special permissions
    // For now, we'll return null to indicate we can't determine this
    // In a real implementation, you might check organization membership
    return null;
  }

  /**
   * Get repository information
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Object>} Repository information
   */
  async getRepository(owner, repo) {
    if (!owner || !repo) {
      throw new Error('Owner and repo are required');
    }

    try {
      return await this._request(`/repos/${owner}/${repo}`);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if repository has security policy
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<boolean>} True if security policy exists
   */
  async hasSecurityPolicy(owner, repo) {
    try {
      const policy = await this._request(`/repos/${owner}/${repo}/contents/SECURITY.md`);
      return policy !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get repository contents
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} path - File path (optional, defaults to root)
   * @returns {Promise<Array>} Repository contents
   */
  async getRepositoryContents(owner, repo, path = '') {
    try {
      return await this._request(`/repos/${owner}/${repo}/contents/${path}`);
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get rate limit status
   * @returns {Promise<Object>} Rate limit information
   */
  async getRateLimit() {
    try {
      return await this._request('/rate_limit');
    } catch (error) {
      return {
        remaining: this.rateLimitRemaining,
        reset: this.rateLimitReset,
      };
    }
  }

  /**
   * Check if we have remaining rate limit
   * @returns {boolean} True if rate limit remaining
   */
  hasRateLimit() {
    return this.rateLimitRemaining === null || this.rateLimitRemaining > 0;
  }
}

module.exports = GitHubClient;

