```markdown
# dograhV2 Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the `dograhV2` TypeScript codebase. It covers file naming, import/export styles, commit message conventions, and testing patterns. While no specific automation workflows are detected, this guide provides best practices and suggested commands to streamline common development tasks.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `userProfile.ts`, `orderManager.ts`

### Import Style
- Use **alias imports** to reference modules.
  - Example:
    ```typescript
    import { fetchData as getData } from './apiClient';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // In userProfile.ts
    export function getUserProfile(id: string) { ... }
    export const USER_ROLE = 'admin';
    ```

### Commit Messages
- Follow **conventional commit** format.
- Use the `feat` prefix for new features.
- Keep commit messages concise (average 71 characters).
  - Example:
    ```
    feat: add user authentication middleware
    ```

## Workflows

### Feature Development
**Trigger:** When implementing a new feature  
**Command:** `/feature`

1. Create a new branch for your feature.
2. Write code following the coding conventions.
3. Use named exports and alias imports as needed.
4. Write or update corresponding test files (`*.test.*`).
5. Commit changes using the `feat` prefix and a descriptive message.
6. Open a pull request for review.

### Testing Code
**Trigger:** Before pushing or merging changes  
**Command:** `/test`

1. Identify or create test files matching `*.test.*`.
2. Run the test suite using your preferred test runner.
3. Ensure all tests pass before proceeding.

## Testing Patterns

- Test files follow the `*.test.*` pattern (e.g., `userProfile.test.ts`).
- The specific testing framework is not defined; use your team's preferred runner.
- Example test file:
  ```typescript
  // userProfile.test.ts
  import { getUserProfile } from './userProfile';

  describe('getUserProfile', () => {
    it('returns user data for valid ID', () => {
      expect(getUserProfile('123')).toEqual({ id: '123', name: 'Alice' });
    });
  });
  ```

## Commands
| Command    | Purpose                                 |
|------------|-----------------------------------------|
| /feature   | Start a new feature development workflow |
| /test      | Run the test suite                      |
```
