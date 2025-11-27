module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'prettier',
  ],
  plugins: ['node'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'node/no-unsupported-features/es-syntax': 'off',
    'node/no-missing-import': 'off',
    'node/no-missing-require': ['error', { allowModules: ['inquirer', 'ora'] }],
  },
};

