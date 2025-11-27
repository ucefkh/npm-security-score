# Contributing to npm-security-score

Thank you for your interest in contributing to npm-security-score! This project aims to establish world-class security standards for the npm ecosystem, and we need your help.

## 🎯 Our Mission

We're fighting to stop the "Wild West" of npm package security. Every contribution helps protect millions of developers from supply chain attacks.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)

## 📜 Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please be respectful, inclusive, and constructive in all interactions.

## 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone git@github.com:your-username/npm-security-score.git
   cd npm-security-score
   ```
3. **Set up upstream remote**
   ```bash
   git remote add upstream git@github.com:01tek/npm-security-score.git
   ```
4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🛠️ Development Setup

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Git

### Installation

```bash
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting

```bash
# Check code style
npm run lint

# Fix code style issues
npm run lint:fix
```

### Building

```bash
# Build the project
npm run build

# Build in watch mode
npm run build:watch
```

## 🤝 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported
2. Create a new issue with the `bug` label
3. Include:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details
   - Error messages/logs

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a new issue with the `enhancement` label
3. Include:
   - Clear description
   - Use cases
   - Potential implementation approach
   - Benefits

### Contributing Code

**🎯 The [plan.md](plan.md) is your roadmap!** It contains all tasks organized by phase with detailed subtasks.

1. **Read [plan.md](plan.md)** - Find tasks marked with `[ ]` (not started)
2. **Pick a task** - Choose any task that interests you
3. **Create an issue** - Comment on the task to claim it (optional but recommended)
4. **Create a branch** from `main` - Use descriptive name like `feature/task-1-2-1`
5. **Write code** following our standards
6. **Write tests** for your changes (aim for >80% coverage)
7. **Ensure all tests pass** - Run `npm test && npm run lint`
8. **Update plan.md** - Mark your task as `[x]` completed
9. **Submit a pull request** - Reference the task number in PR description

### Finding Tasks to Work On

The [plan.md](plan.md) file is organized into 8 phases:
- **Phase 1**: Foundation & Core Infrastructure (mostly complete)
- **Phase 2**: Security Rule Implementation (ready to start!)
- **Phase 3**: CLI & User Interface
- **Phase 4**: CI/CD Integration
- **Phase 5**: Advanced Features
- **Phase 6**: Testing & Quality Assurance
- **Phase 7**: Documentation & Community
- **Phase 8**: Publishing & Distribution

Each task has a unique ID (e.g., `1.2.1`) and detailed subtasks. Look for `[ ]` to find uncompleted work!

### Areas Needing Contribution

- 🔒 Security rule improvements
- ⚡ Performance optimizations
- 📚 Documentation improvements
- 🐛 Bug fixes
- ✨ New features
- 🧪 Test improvements
- 🌐 Internationalization
- 🎨 UI/UX improvements

## 📝 Coding Standards

### General Guidelines

- **Write clear, readable code** - Code is read more than it's written
- **Follow existing patterns** - Consistency is key
- **Keep functions small** - Single responsibility principle
- **Use meaningful names** - Variables, functions, and classes should be self-documenting
- **Add comments** - Explain "why", not "what"
- **Handle errors gracefully** - Never silently fail

### JavaScript/TypeScript Style

- Use **ES6+** features
- Prefer **const** over let, avoid var
- Use **arrow functions** for callbacks
- Use **async/await** over promises
- Use **template literals** for strings
- Follow **Airbnb JavaScript Style Guide** (with project-specific overrides)

### Code Structure

```
src/
  ├── core/           # Core scoring engine
  ├── rules/          # Security rules
  ├── utils/          # Utility functions
  ├── cli/            # CLI implementation
  ├── api/            # API clients
  └── types/          # TypeScript types
```

### File Naming

- Use **kebab-case** for file names: `score-calculator.js`
- Use **PascalCase** for classes: `ScoreCalculator`
- Use **camelCase** for functions and variables: `calculateScore`

### Example Code

```javascript
/**
 * Calculates the security score for a package.
 * @param {PackageMetadata} packageData - Package metadata
 * @param {ScoringConfig} config - Scoring configuration
 * @returns {Promise<ScoreResult>} The calculated score and details
 */
async function calculateSecurityScore(packageData, config) {
  if (!packageData) {
    throw new Error('Package data is required');
  }

  const rules = getActiveRules(config);
  let score = 100;

  for (const rule of rules) {
    const result = await rule.evaluate(packageData);
    score -= result.deduction;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    band: getScoreBand(score),
    details: getScoreDetails(rules)
  };
}
```

## 🧪 Testing Requirements

### Test Coverage

- **Minimum 80% coverage** for new code
- **100% coverage** for critical security rules
- All edge cases should be tested
- Both positive and negative test cases

### Writing Tests

```javascript
describe('ScoreCalculator', () => {
  describe('calculateSecurityScore', () => {
    it('should return score between 0 and 100', async () => {
      const result = await calculateSecurityScore(mockPackageData);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should throw error for invalid input', async () => {
      await expect(
        calculateSecurityScore(null)
      ).rejects.toThrow('Package data is required');
    });
  });
});
```

### Test Types

- **Unit tests** - Test individual functions/classes
- **Integration tests** - Test component interactions
- **E2E tests** - Test full workflows
- **Performance tests** - Test under load

## 🔄 Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] No console.logs or debug code
- [ ] No commented-out code
- [ ] Commit messages are clear

### PR Checklist

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Update CHANGELOG.md** (if applicable)
4. **Ensure CI passes**
5. **Request review** from maintainers

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add lifecycle script detection rule
fix: handle null package metadata gracefully
docs: update CLI usage examples
test: add tests for network call detection
refactor: simplify score calculation logic
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## 📋 Issue Guidelines

### Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `question` - Questions or discussions
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `security` - Security-related issues

### Creating Issues

- **Be specific** - Clear title and description
- **Provide context** - Why is this needed?
- **Include examples** - Code examples, screenshots
- **Reference related issues** - Link to related issues/PRs

## 🏆 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation
- Appreciated by the community! 🙏

## ❓ Questions?

- Open a discussion in GitHub Discussions
- Ask in our community chat (if available)
- Create an issue with the `question` label

## 📚 Additional Resources

- [Plan.md](plan.md) - Full project plan
- [README.md](README.md) - Project overview
- [Code of Conduct](CODE_OF_CONDUCT.md) - Community guidelines

---

**Thank you for contributing to making npm security world-class! 🚀🔒**

