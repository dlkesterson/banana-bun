# Branch Protection Rules Setup

To enable branch protection rules that require CI checks before merging PRs, follow these steps:

## 1. Navigate to Repository Settings

1. Go to your repository on GitHub
2. Click on **Settings** tab
3. Click on **Branches** in the left sidebar

## 2. Add Branch Protection Rule

1. Click **Add rule**
2. In **Branch name pattern**, enter: `main`
3. Configure the following settings:

### Required Settings:
- ✅ **Require a pull request before merging**
  - ✅ Require approvals: `1`
  - ✅ Dismiss stale PR approvals when new commits are pushed
  - ✅ Require review from code owners (if you have a CODEOWNERS file)

- ✅ **Require status checks to pass before merging**
  - ✅ Require branches to be up to date before merging
  - Add the following required status checks:
    - `Test & Coverage`
    - `Lint`
    - `Build & Type Check`
    - `Security Audit`
    - `Coverage Check`

- ✅ **Require conversation resolution before merging**
- ✅ **Require signed commits** (optional but recommended)
- ✅ **Include administrators** (applies rules to admins too)

### Optional but Recommended:
- ✅ **Restrict pushes that create files that exceed 100MB**
- ✅ **Allow force pushes** (unchecked - prevents force pushes)
- ✅ **Allow deletions** (unchecked - prevents branch deletion)

## 3. Save the Rule

Click **Create** to save the branch protection rule.

## 4. Repeat for Development Branch (if applicable)

If you use a `develop` branch, repeat the same process with:
- Branch name pattern: `develop`
- Same settings as above

## 5. Required Status Checks

The CI workflow defines these jobs that must pass:
- **Test & Coverage**: Runs all tests and generates coverage reports
- **Lint**: Checks code style and quality with ESLint
- **Build & Type Check**: Verifies TypeScript compilation
- **Security Audit**: Checks for security vulnerabilities
- **Coverage Check**: Ensures minimum 80% code coverage

## 6. Codecov Integration (Optional)

To enable Codecov integration:
1. Go to [codecov.io](https://codecov.io)
2. Sign up/login with your GitHub account
3. Add your repository
4. Get your repository token
5. Add it as a secret in your GitHub repository:
   - Go to Settings > Secrets and variables > Actions
   - Add new repository secret: `CODECOV_TOKEN`
   - Paste your Codecov token

## Result

Once configured, all PRs to `main` (and `develop` if configured) will:
1. Require at least 1 approval
2. Must pass all CI checks
3. Must have up-to-date branches
4. Must resolve all conversations
5. Cannot be merged until all requirements are met

This ensures code quality and prevents broken code from entering your main branches.
