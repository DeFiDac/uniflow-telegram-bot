# UniFlow Telegram Bot

## Overview

Built with Typescript, node-telegram-bot-api, and privy-io/node.

## Testing

### Test Coverage

The project maintains high test coverage across all command handlers:

| Metric      | Coverage | Target | Status |
|-------------|----------|--------|--------|
| Statements  | 88.8%    | 80%    | ✅     |
| Branches    | 77.19%   | 75%    | ✅     |
| Functions   | 100%     | 80%    | ✅     |
| Lines       | 88.7%    | 80%    | ✅     |

**Test Suite:** 23 passing tests across 3 test files

#### Coverage by File

```text
File            | % Stmts | % Branch | % Funcs | % Lines
----------------|---------|----------|---------|--------
constants.ts    |    100% |     100% |    100% |   100%
connect.ts      |  97.29% |      85% |    100% | 97.22%
disconnect.ts   |    100% |    87.5% |    100% |   100%
transact.ts     |  77.96% |   68.96% |    100% | 77.96%
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode (auto-rerun on changes)
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Open interactive test UI
pnpm test:ui
```

### Test Structure

- **Unit Tests**: Command handlers tested with comprehensive mocks
- **Test Categories**: Happy paths, edge cases, error handling, multi-user isolation
- **Fast Execution**: All tests complete in ~200ms

For detailed testing documentation, see [TESTING.md](./TESTING.md).
