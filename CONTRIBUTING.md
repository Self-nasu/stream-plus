# Contributing to Stream Plus

Thank you for your interest in contributing to Stream Plus! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with the following information:

- **Clear title**: Describe the issue concisely
- **Description**: Detailed explanation of the bug
- **Steps to reproduce**: How to recreate the issue
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: OS, Node version, etc.
- **Logs**: Relevant error messages or logs

### Suggesting Features

Feature requests are welcome! Please include:

- **Use case**: Why this feature would be useful
- **Proposed solution**: How you envision it working
- **Alternatives**: Other approaches you've considered

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the code style guidelines
3. **Add tests** for new functionality
4. **Update documentation** as needed
5. **Ensure tests pass**: Run `npm test`
6. **Commit your changes** with clear commit messages
7. **Push to your fork** and submit a pull request

#### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Write clear, descriptive commit messages
- Include tests for new features
- Update relevant documentation
- Follow the existing code style
- Ensure all tests pass before submitting

## Development Setup

1. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/stream-plus.git
   cd stream-plus
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp sample_env .env
   # Configure your .env file
   ```

4. **Start infrastructure**
   ```bash
   docker-compose up -d
   ```

5. **Run in development mode**
   ```bash
   npm run start:dev
   ```

## Code Style

- **TypeScript**: Use TypeScript for all new code
- **Formatting**: Run `npm run format` before committing
- **Linting**: Run `npm run lint` and fix any issues
- **Naming**: Use descriptive variable and function names
- **Comments**: Add comments for complex logic

### NestJS Conventions

- Use dependency injection
- Follow the module/controller/service pattern
- Use DTOs for request/response validation
- Implement proper error handling
- Use guards for authentication/authorization

## Testing

- Write unit tests for services and utilities
- Write integration tests for controllers
- Aim for >80% code coverage
- Test edge cases and error conditions

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:cov
```

## Commit Message Format

Follow the conventional commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(stream): add support for 4K resolution
fix(upload): handle large file uploads correctly
docs(readme): update installation instructions
```

## Project Structure

```
src/
├── upload/          # Video upload module
├── processor/       # Video processing workers
├── stream/          # HLS streaming module
├── organization/    # Multi-tenancy
├── admin/           # Admin operations
├── shared/          # Shared services
└── schemas/         # MongoDB schemas
```

## Questions?

Feel free to open an issue for any questions or concerns. We're here to help!

## License

By contributing to Stream Plus, you agree that your contributions will be licensed under the MIT License.
