#!/usr/bin/env node

/**
 * CLI entry point for npm-security-score
 * Command-line interface for scoring npm packages
 */

const { Command } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const ScoringService = require('../src/cli/scoringService');
const OutputFormatter = require('../src/cli/outputFormatter');
const config = require('../src/utils/config');
const { version } = require('../package.json');
const { shouldBlock } = require('../src/core/scoreBands');

const program = new Command();

program
  .name('npm-security-score')
  .description('World-class security scoring system for npm packages')
  .version(version);

/**
 * Load configuration from file if provided
 */
async function loadConfig(configPath) {
  if (configPath) {
    try {
      await config.loadFromFile(configPath);
    } catch (error) {
      console.error(`Error loading config file: ${error.message}`);
      process.exit(1);
    }
  }
}

/**
 * Handle output file writing
 */
async function handleOutput(outputPath, content, formatter) {
  if (outputPath) {
    try {
      await formatter.writeToFile(outputPath, content);
      console.log(`\n✅ Report saved to: ${path.resolve(outputPath)}`);
    } catch (error) {
      console.error(`Error writing output file: ${error.message}`);
      process.exit(1);
    }
  }
}

/**
 * Handle CI/CD failure threshold
 */
function handleFailBelow(score, threshold) {
  if (threshold !== undefined && score < threshold) {
    console.error(
      `\n❌ Security score ${score} is below threshold ${threshold}`
    );
    process.exit(1);
  }
}

// Score command
program
  .command('score')
  .description('Score a single npm package')
  .argument('<package>', 'Package name (optionally with version: package@version)')
  .option('-v, --verbose', 'Show detailed output', false)
  .option('-j, --json', 'Output as JSON', false)
  .option('--fail-below <score>', 'Exit with error if score is below threshold', parseFloat)
  .option('-c, --config <file>', 'Path to config file')
  .option('-o, --output <file>', 'Save report to file')
  .action(async (pkg, options) => {
    try {
      // Load config if provided
      await loadConfig(options.config);

      // Parse package name and version
      const [packageName, version] = pkg.includes('@') && !pkg.startsWith('@')
        ? pkg.split('@')
        : [pkg, null];

      // Create services
      const scoringService = new ScoringService({
        config: config.getAll(),
        verbose: options.verbose,
      });
      const formatter = new OutputFormatter({
        json: options.json,
        verbose: options.verbose,
      });

      // Score package
      const result = await scoringService.scorePackage(packageName, version);

      // Format and display
      const output = formatter.formatResult(result);
      console.log(output);

      // Handle output file
      await handleOutput(options.output, result, formatter);

      // Handle fail-below threshold
      handleFailBelow(result.score, options.failBelow);

      process.exit(0);
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Batch command
program
  .command('batch')
  .description('Score multiple packages from a file or list')
  .argument('[packages...]', 'Package names (or read from stdin/file)')
  .option('-f, --file <file>', 'Read packages from file (one per line)')
  .option('-v, --verbose', 'Show detailed output', false)
  .option('-j, --json', 'Output as JSON', false)
  .option('--fail-below <score>', 'Exit with error if any score is below threshold', parseFloat)
  .option('-c, --config <file>', 'Path to config file')
  .option('-o, --output <file>', 'Save report to file')
  .action(async (packages, options) => {
    try {
      // Load config if provided
      await loadConfig(options.config);

      let packageList = packages;

      // Read from file if provided
      if (options.file) {
        try {
          const content = await fs.readFile(options.file, 'utf-8');
          packageList = content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
        } catch (error) {
          console.error(`Error reading file: ${error.message}`);
          process.exit(1);
        }
      }

      // Read from stdin if no packages provided
      if (packageList.length === 0 && !options.file) {
        let stdin = '';
        process.stdin.setEncoding('utf8');
        for await (const chunk of process.stdin) {
          stdin += chunk;
        }
        packageList = stdin
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));
      }

      if (packageList.length === 0) {
        console.error('No packages provided');
        process.exit(1);
      }

      // Create services
      const scoringService = new ScoringService({
        config: config.getAll(),
        verbose: options.verbose,
      });
      const formatter = new OutputFormatter({
        json: options.json,
        verbose: options.verbose,
      });

      // Score packages
      const results = await scoringService.scorePackages(packageList);

      // Format and display
      const output = formatter.formatResults(results);
      console.log(output);

      // Handle output file
      await handleOutput(options.output, results, formatter);

      // Handle fail-below threshold
      if (options.failBelow !== undefined) {
        const successful = results.filter((r) => r.success);
        const belowThreshold = successful.filter(
          (r) => r.result.score < options.failBelow
        );

        if (belowThreshold.length > 0) {
          console.error(
            `\n❌ ${belowThreshold.length} package(s) scored below threshold ${options.failBelow}`
          );
          belowThreshold.forEach((item) => {
            console.error(
              `  - ${item.result.packageName}@${item.result.packageVersion}: ${item.result.score}`
            );
          });
          process.exit(1);
        }
      }

      process.exit(0);
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Compare command
program
  .command('compare')
  .description('Compare security scores of two packages')
  .argument('<package1>', 'First package name (optionally with version)')
  .argument('<package2>', 'Second package name (optionally with version)')
  .option('-v, --verbose', 'Show detailed output', false)
  .option('-j, --json', 'Output as JSON', false)
  .option('-c, --config <file>', 'Path to config file')
  .option('-o, --output <file>', 'Save report to file')
  .action(async (pkg1, pkg2, options) => {
    try {
      // Load config if provided
      await loadConfig(options.config);

      // Parse package names and versions
      const parsePackage = (pkg) => {
        return pkg.includes('@') && !pkg.startsWith('@')
          ? pkg.split('@')
          : [pkg, null];
      };

      const [packageName1, version1] = parsePackage(pkg1);
      const [packageName2, version2] = parsePackage(pkg2);

      // Create services
      const scoringService = new ScoringService({
        config: config.getAll(),
        verbose: options.verbose,
      });
      const formatter = new OutputFormatter({
        json: options.json,
        verbose: options.verbose,
      });

      // Score both packages
      const [result1, result2] = await Promise.all([
        scoringService.scorePackage(packageName1, version1),
        scoringService.scorePackage(packageName2, version2),
      ]);

      // Format and display comparison
      const output = formatter.formatComparison(result1, result2);
      console.log(output);

      // Handle output file
      const comparisonData = {
        package1: result1,
        package2: result2,
        comparison: {
          scoreDifference: result1.score - result2.score,
          recommendation:
            result1.score > result2.score
              ? result1.packageName
              : result2.packageName,
        },
      };
      await handleOutput(options.output, comparisonData, formatter);

      process.exit(0);
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}
