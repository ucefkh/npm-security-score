/**
 * npm-security-score
 * World-class security scoring system for npm packages
 */

const ScoreCalculator = require('./core/ScoreCalculator');
const RuleRegistry = require('./core/RuleRegistry');
const BaseRule = require('./core/BaseRule');
const { getScoreBand, shouldBlock, getScoreInterpretation } = require('./core/scoreBands');

// Security Rules
const LifecycleScriptRiskRule = require('./rules/LifecycleScriptRiskRule');
const ExternalNetworkCallRule = require('./rules/ExternalNetworkCallRule');
const MaintainerSecurityRule = require('./rules/MaintainerSecurityRule');
const CodeObfuscationRule = require('./rules/CodeObfuscationRule');
const UpdateBehaviorRule = require('./rules/UpdateBehaviorRule');
const CommunitySignalsRule = require('./rules/CommunitySignalsRule');
// Bonus Rules
const VerifiedPublisherRule = require('./rules/VerifiedPublisherRule');
const SignedReleasesRule = require('./rules/SignedReleasesRule');
const SBOMDetectionRule = require('./rules/SBOMDetectionRule');
const AdvisoryHistoryRule = require('./rules/AdvisoryHistoryRule');
const NpmRegistryClient = require('./api/NpmRegistryClient');
const GitHubClient = require('./api/GitHubClient');
const AdvisoryClient = require('./api/AdvisoryClient');
const PackageAnalyzer = require('./utils/packageAnalyzer');
const TarballAnalyzer = require('./utils/tarballAnalyzer');
const config = require('./utils/config');

module.exports = {
  // Core scoring
  ScoreCalculator,
  RuleRegistry,
  BaseRule,
  scoreBands: {
    getScoreBand,
    shouldBlock,
    getScoreInterpretation,
  },
  // API clients
  NpmRegistryClient,
  GitHubClient,
  AdvisoryClient,
  // Utilities
  PackageAnalyzer,
  TarballAnalyzer,
  config,
  // Security Rules
  LifecycleScriptRiskRule,
  ExternalNetworkCallRule,
  MaintainerSecurityRule,
  CodeObfuscationRule,
  UpdateBehaviorRule,
  CommunitySignalsRule,
  AdvisoryHistoryRule,
  // Bonus Rules
  VerifiedPublisherRule,
  SignedReleasesRule,
  SBOMDetectionRule,
  // Version
  version: require('../package.json').version,
};
