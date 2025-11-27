/**
 * Interactive CLI mode
 * Provides interactive package selection and scoring
 */

const inquirer = require('inquirer');
const ora = require('ora');
const ScoringService = require('./scoringService');
const OutputFormatter = require('./outputFormatter');

class InteractiveMode {
  constructor(config = {}) {
    this.scoringService = new ScoringService(config);
    this.formatter = new OutputFormatter({
      verbose: config.verbose || false,
    });
  }

  /**
   * Start interactive mode
   */
  async start() {
    console.log('\n🔒 npm-security-score - Interactive Mode\n');

    let shouldContinue = true;
    // eslint-disable-next-line no-constant-condition
    while (shouldContinue) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Score a package', value: 'score' },
            { name: 'Compare packages', value: 'compare' },
            { name: 'Batch score packages', value: 'batch' },
            { name: 'Exit', value: 'exit' },
          ],
        },
      ]);

      if (action === 'exit') {
        console.log('\n👋 Goodbye!\n');
        return;
      }

      try {
        switch (action) {
          case 'score':
            await this.handleScore();
            break;
          case 'compare':
            await this.handleCompare();
            break;
          case 'batch':
            await this.handleBatch();
            break;
        }
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }

      // Ask if user wants to continue
      const { continue: shouldContinue } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: 'Would you like to perform another action?',
          default: true,
        },
      ]);

      if (!shouldContinue) {
        console.log('\n👋 Goodbye!\n');
        shouldContinue = false;
        break;
      }
    }
  }

  /**
   * Handle score action
   * @private
   */
  async handleScore() {
    const { packageInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'packageInput',
        message: 'Enter package name (optionally with version, e.g., express@4.18.0):',
        validate: (input) => {
          if (!input || input.trim().length === 0) {
            return 'Package name is required';
          }
          return true;
        },
      },
    ]);

    const [packageName, version] = packageInput.includes('@') && !packageInput.startsWith('@')
      ? packageInput.split('@')
      : [packageInput.trim(), null];

    const spinner = ora(`Scoring ${packageName}${version ? `@${version}` : ''}...`).start();

    try {
      const result = await this.scoringService.scorePackage(packageName, version);
      spinner.succeed('Scoring complete!');

      console.log('\n' + this.formatter.formatResult(result) + '\n');

      // Ask if user wants to save report
      const { saveReport } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'saveReport',
          message: 'Would you like to save this report to a file?',
          default: false,
        },
      ]);

      if (saveReport) {
        const { outputPath, format } = await inquirer.prompt([
          {
            type: 'list',
            name: 'format',
            message: 'Select report format:',
            choices: [
              { name: 'JSON', value: 'json' },
              { name: 'Markdown', value: 'markdown' },
              { name: 'Text', value: 'text' },
            ],
          },
          {
            type: 'input',
            name: 'outputPath',
            message: 'Enter output file path:',
            default: `security-report-${packageName}-${Date.now()}.${format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt'}`,
          },
        ]);

        const formatter = new OutputFormatter({
          json: format === 'json',
          markdown: format === 'markdown',
        });

        await formatter.writeToFile(outputPath, result);
        console.log(`\n✅ Report saved to: ${outputPath}\n`);
      }
    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle compare action
   * @private
   */
  async handleCompare() {
    const { package1, package2 } = await inquirer.prompt([
      {
        type: 'input',
        name: 'package1',
        message: 'Enter first package name:',
        validate: (input) => input.trim().length > 0 || 'Package name is required',
      },
      {
        type: 'input',
        name: 'package2',
        message: 'Enter second package name:',
        validate: (input) => input.trim().length > 0 || 'Package name is required',
      },
    ]);

    const parsePackage = (pkg) => {
      return pkg.includes('@') && !pkg.startsWith('@')
        ? pkg.split('@')
        : [pkg.trim(), null];
    };

    const [name1, version1] = parsePackage(package1);
    const [name2, version2] = parsePackage(package2);

    const spinner = ora(`Comparing ${name1} and ${name2}...`).start();

    try {
      const [result1, result2] = await Promise.all([
        this.scoringService.scorePackage(name1, version1),
        this.scoringService.scorePackage(name2, version2),
      ]);

      spinner.succeed('Comparison complete!');

      console.log('\n' + this.formatter.formatComparison(result1, result2) + '\n');
    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle batch action
   * @private
   */
  async handleBatch() {
    const { packagesInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'packagesInput',
        message: 'Enter package names (comma-separated):',
        validate: (input) => {
          const packages = input.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
          if (packages.length === 0) {
            return 'At least one package is required';
          }
          return true;
        },
      },
    ]);

    const packages = packagesInput
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const spinner = ora(`Scoring ${packages.length} package(s)...`).start();

    try {
      const results = await this.scoringService.scorePackages(packages);
      spinner.succeed('Batch scoring complete!');

      console.log('\n' + this.formatter.formatResults(results) + '\n');
    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = InteractiveMode;

