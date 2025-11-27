/**
 * Basic Usage Example
 * Demonstrates how to use npm-security-score to evaluate package security
 */

const {
  ScoreCalculator,
  LifecycleScriptRiskRule,
  NpmRegistryClient,
  PackageAnalyzer,
} = require('../src/index');

async function evaluatePackage(packageName, version = null) {
  console.log(`\n🔍 Evaluating: ${packageName}${version ? `@${version}` : ''}\n`);

  try {
    // 1. Fetch package metadata from npm registry
    const registryClient = new NpmRegistryClient();
    const packageMetadata = await registryClient.getPackageMetadata(packageName, version);

    console.log(`✅ Fetched metadata for ${packageMetadata.name}@${packageMetadata.version}`);

    // 2. Analyze package
    const packageSummary = PackageAnalyzer.getPackageSummary(packageMetadata);
    console.log(`📦 Package has ${packageSummary.hasLifecycleScripts ? packageSummary.lifecycleScripts.length : 0} lifecycle scripts`);

    // 3. Create score calculator
    const calculator = new ScoreCalculator();

    // 4. Register security rules
    const lifecycleRule = new LifecycleScriptRiskRule(30);
    calculator.registerRule(lifecycleRule);

    // 5. Calculate security score
    const result = await calculator.calculateScore(packageMetadata);

    // 6. Display results
    console.log(`\n📊 Security Score: ${result.score}/100`);
    console.log(`🏷️  Band: ${result.band.emoji} ${result.band.label}`);
    console.log(`📝 Description: ${result.band.description}\n`);

    if (result.ruleResults.length > 0) {
      console.log('🔍 Rule Results:');
      result.ruleResults.forEach((ruleResult) => {
        if (ruleResult.deduction > 0) {
          console.log(`\n  Rule: ${ruleResult.ruleName}`);
          console.log(`  Deduction: -${ruleResult.deduction} points`);
          console.log(`  Risk Level: ${ruleResult.riskLevel}`);

          if (ruleResult.details.findings) {
            ruleResult.details.findings.forEach((finding) => {
              console.log(`\n    ⚠️  ${finding.hook}:`);
              console.log(`       Script: ${finding.script}`);
              console.log(`       Issues: ${finding.issues.length}`);
              finding.issues.forEach((issue) => {
                console.log(`         - ${issue.type}: ${issue.description}`);
              });
            });
          }
        }
      });
    } else {
      console.log('✅ No security issues detected by registered rules');
    }

    return result;
  } catch (error) {
    console.error(`❌ Error evaluating package: ${error.message}`);
    throw error;
  }
}

// Example usage
if (require.main === module) {
  // Example 1: Safe package (no suspicious scripts)
  evaluatePackage('express')
    .then(() => {
      // Example 2: Package with suspicious script (this would fail in real scenario)
      console.log('\n' + '='.repeat(60) + '\n');
      return evaluatePackage('lodash');
    })
    .catch((error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = { evaluatePackage };

