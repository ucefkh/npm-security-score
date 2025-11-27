/**
 * Tarball analyzer utilities
 * Downloads and analyzes npm package tarballs
 */

const https = require('https');
const http = require('http');
const gunzip = require('gunzip-maybe');
const tar = require('tar-stream');
const { mkdir, rm } = require('fs').promises;
const { createWriteStream, createReadStream } = require('fs');
const path = require('path');
const os = require('os');

class TarballAnalyzer {
  constructor(options = {}) {
    this.tempDir = options.tempDir || path.join(os.tmpdir(), 'npm-security-score');
    this.timeout = options.timeout || 60000; // 60 seconds for large packages
  }

  /**
   * Download and extract package tarball
   * @param {string} tarballUrl - URL of the tarball
   * @param {string} packageName - Name of the package (for temp directory)
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeTarball(tarballUrl, packageName) {
    if (!tarballUrl) {
      throw new Error('Tarball URL is required');
    }

    const tempPath = path.join(this.tempDir, packageName.replace('/', '_'));
    let extractedPath = null;

    try {
      // Create temp directory
      await mkdir(tempPath, { recursive: true });

      // Download tarball
      const tarballPath = path.join(tempPath, 'package.tgz');
      await this._downloadTarball(tarballUrl, tarballPath);

      // Extract tarball
      extractedPath = path.join(tempPath, 'extracted');
      await this._extractTarball(tarballPath, extractedPath);

      // Analyze extracted contents
      const analysis = await this._analyzeContents(extractedPath);

      return analysis;
    } finally {
      // Cleanup temp files
      try {
        if (extractedPath) {
          await rm(extractedPath, { recursive: true, force: true });
        }
        await rm(tempPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Download tarball from URL
   * @private
   */
  async _downloadTarball(url, destPath) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;

      const request = client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download tarball: HTTP ${response.statusCode}`)
          );
          return;
        }

        const fileStream = createWriteStream(destPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (error) => {
          rm(destPath, { force: true }).catch(() => {});
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(this.timeout, () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Extract tarball to directory
   * @private
   */
  async _extractTarball(tarballPath, extractPath) {
    await mkdir(extractPath, { recursive: true });

    return new Promise((resolve, reject) => {
      const extract = tar.extract();

      extract.on('entry', async (header, stream, next) => {
        const filePath = path.join(extractPath, header.name);

        // Skip if outside extract path (security)
        if (!filePath.startsWith(extractPath)) {
          stream.resume();
          next();
          return;
        }

        if (header.type === 'directory') {
          await mkdir(filePath, { recursive: true });
          stream.resume();
          next();
        } else if (header.type === 'file') {
          const writeStream = createWriteStream(filePath);
          stream.pipe(writeStream);
          writeStream.on('finish', next);
          stream.on('error', next);
        } else {
          stream.resume();
          next();
        }
      });

      extract.on('finish', resolve);
      extract.on('error', reject);

      const readStream = createReadStream(tarballPath);
      readStream.pipe(gunzip()).pipe(extract);
    });
  }

  /**
   * Analyze extracted package contents
   * @private
   */
  async _analyzeContents(extractPath) {
    const { readFile } = require('fs').promises;
    const packageJsonPath = path.join(extractPath, 'package', 'package.json');

    const analysis = {
      packageJson: null,
      fileStructure: [],
      totalFiles: 0,
      totalSize: 0,
      hasPackageJson: false,
      largestFiles: [],
    };

    try {
      // Read package.json
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
      analysis.packageJson = JSON.parse(packageJsonContent);
      analysis.hasPackageJson = true;
    } catch (error) {
      // package.json might not exist or be invalid
      analysis.hasPackageJson = false;
    }

    // Analyze file structure
    const packagePath = path.join(extractPath, 'package');
    try {
      await this._analyzeDirectory(packagePath, packagePath, analysis);
    } catch (error) {
      // Directory might not exist
    }

    // Sort largest files
    analysis.largestFiles = analysis.largestFiles
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return analysis;
  }

  /**
   * Recursively analyze directory structure
   * @private
   */
  async _analyzeDirectory(rootPath, currentPath, analysis) {
    const { readdir, stat: statFile } = require('fs').promises;

    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        if (entry.isDirectory()) {
          analysis.fileStructure.push({
            path: relativePath,
            type: 'directory',
          });
          await this._analyzeDirectory(rootPath, fullPath, analysis);
        } else if (entry.isFile()) {
          try {
            const stats = await statFile(fullPath);
            analysis.totalFiles++;
            analysis.totalSize += stats.size;

            analysis.fileStructure.push({
              path: relativePath,
              type: 'file',
              size: stats.size,
            });

            // Track large files
            if (stats.size > 1024 * 1024) {
              // Files larger than 1MB
              analysis.largestFiles.push({
                path: relativePath,
                size: stats.size,
              });
            }
          } catch (error) {
            // Skip files we can't stat
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Get file content from extracted tarball (for analysis)
   * @param {string} extractPath - Path to extracted package
   * @param {string} filePath - Relative path to file
   * @returns {Promise<string>} File content
   */
  async getFileContent(extractPath, filePath) {
    const { readFile } = require('fs').promises;
    const fullPath = path.join(extractPath, 'package', filePath);

    // Security check - ensure file is within extract path
    if (!fullPath.startsWith(extractPath)) {
      throw new Error('Invalid file path');
    }

    try {
      return await readFile(fullPath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }
}

module.exports = TarballAnalyzer;

