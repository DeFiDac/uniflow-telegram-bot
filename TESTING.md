# Testing Infrastructure - UniFlow Telegram Bot

## Overview

This document describes the comprehensive testing infrastructure implemented for the UniFlow Telegram bot using Vitest.

## Test Coverage

Current test coverage metrics:

- **Statements**: 88.8% (target: 80%)
- **Branches**: 77.19% (target: 75%)
- **Functions**: 100% (target: 80%)
- **Lines**: 88.7% (target: 80%)

**Total Tests**: 23 passing tests across 3 test suites

## Project Structure

### Source Code Organization

```
src/
├── commands/
│   ├── connect.ts       # /connect command handler
│   ├── disconnect.ts    # /disconnect command handler
│   ├── transact.ts      # /transact command handler
│   └── index.ts         # Command exports
├── types/
│   └── index.ts         # TypeScript type definitions
├── constants.ts         # Centralized constants and messages
└── bot.ts               # Main bot entry point (integration)
```

### Test Organization

```
tests/
├── fixtures/
│   ├── telegram-messages.ts  # Mock Telegram message helpers
│   ├── privy-responses.ts    # Mock Privy API responses
│   └── test-data.ts          # Common test data
├── setup/
│   ├── vitest.setup.ts       # Global test setup
│   └── mocks/
│       ├── telegram-bot.mock.ts  # Telegram bot mock factory
│       └── privy-client.mock.ts  # Privy client mock factory
└── unit/
    └── commands/
        ├── connect.test.ts      # Tests for /connect (7 tests)
        ├── disconnect.test.ts   # Tests for /disconnect (6 tests)
        └── transact.test.ts     # Tests for /transact (10 tests)
```

## Running Tests

### Basic Commands

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (auto-rerun on changes)
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Open interactive UI
pnpm test:ui
```

### Coverage Reports

Coverage reports are generated in multiple formats:
- **Terminal output**: Summary displayed after running `pnpm test:coverage`
- **HTML report**: Open `coverage/index.html` in a browser
- **LCOV format**: `coverage/lcov.info` for CI/CD integration

## Test Structure

### Command Handler Pattern

All command handlers follow this testable pattern:

```typescript
export async function handleCommand(
  msg: TelegramBot.Message,
  { bot, privy, sessions }: CommandDependencies
): Promise<void> {
  // 1. Validate inputs
  if (!msg.from) return;
  if (!msg.chat?.id) return;

  // 2. Business logic
  try {
    // ... implementation
  } catch (error) {
    // 3. Error handling
    console.error('[/command] Error:', error);
    await bot.sendMessage(chatId, ERROR_MESSAGES.GENERIC);
  }
}
```

### Test Anatomy

Tests follow the Arrange-Act-Assert (AAA) pattern:

```typescript
it('should do something', async () => {
  // Arrange - Set up test data and mocks
  const msg = createMockMessage();
  mockPrivy.users().getByTelegramUserID.mockResolvedValue(mockPrivyUser);

  // Act - Execute the function
  await handleConnect(msg, { bot: mockBot, privy: mockPrivy, sessions });

  // Assert - Verify expected behavior
  expect(sessions.has(789)).toBe(true);
  expect(mockBot.sendMessage).toHaveBeenCalledWith(
    123456,
    expect.stringContaining('connected successfully')
  );
});
```

## Test Categories

### 1. Happy Path Tests
- New user registration and wallet creation
- Existing user reconnection
- Successful transaction execution
- Normal disconnection flow

### 2. Edge Cases
- Missing `msg.from` or `msg.chat`
- No active session when required
- Invalid user responses
- Response from different user

### 3. Error Handling
- Privy API failures
- Message send failures
- Transaction failures
- Timeout scenarios

### 4. Multi-User Isolation
- Ensuring user sessions don't interfere with each other
- Verifying proper session cleanup

## Key Testing Patterns

### Mock Factories

Reusable mock factories prevent duplicate mock creation:

```typescript
export const createMockPrivyClient = () => {
  const mockGetByTelegramUserID = vi.fn();
  const mockCreate = vi.fn();

  const mockUsers = vi.fn(() => ({
    getByTelegramUserID: mockGetByTelegramUserID,
    create: mockCreate,
  }));

  return { users: mockUsers, wallets: mockWallets };
};
```

### Test Fixtures

Centralized test data ensures consistency:

```typescript
export const createMockMessage = (
  overrides?: Partial<TelegramBot.Message>
): TelegramBot.Message => ({
  message_id: 1,
  date: Date.now(),
  chat: { id: 123456, type: 'private' },
  from: { id: 789, is_bot: false, first_name: 'Test' },
  ...overrides,
});
```

### Timer Mocking

For testing timeout behavior:

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should timeout after 60 seconds', async () => {
  await handleTransact(msg, deps);
  await vi.advanceTimersByTimeAsync(60000);
  expect(mockBot.sendMessage).toHaveBeenCalledWith(
    chatId,
    expect.stringContaining('timed out')
  );
});
```

## Configuration

### Vitest Configuration (`vitest.config.ts`)

Key settings:
- **Environment**: Node.js
- **Global setup**: Clears mocks and silences console between tests
- **Path aliases**: `@/` for src, `@tests/` for tests
- **Coverage provider**: v8 (faster than istanbul)
- **Excluded from coverage**:
  - `src/bot.ts` (integration entry point)
  - `src/**/index.ts` (re-export files)
  - `src/types/**` (type definitions)

### TypeScript Configuration

The `tsconfig.json` is configured to:
- Include only `src/**/*` for compilation
- Exclude `tests/**/*` to prevent CommonJS compilation
- Support Vitest globals with `"types": ["vitest/globals", "node"]`

## Best Practices

### ✅ Do

- Use descriptive test names that explain what is being tested
- Test both success and failure scenarios
- Mock external dependencies (bot, Privy API)
- Use real data structures (Map for sessions)
- Verify important state changes
- Check error messages for user-facing text

### ❌ Don't

- Don't test implementation details
- Don't mock everything (use real Map, etc.)
- Don't create overly complex test setups
- Don't skip error case testing
- Don't commit compiled test files (*.js in tests/)

## Troubleshooting

### Common Issues

**Tests fail with "Cannot import Vitest in CommonJS"**
- Cause: TypeScript compiled test files to CommonJS
- Fix: Ensure `tests` is excluded in `tsconfig.json` and delete `tests/**/*.js` files

**Mocks not working as expected**
- Cause: Mock factory returns new instances on each call
- Fix: Create shared mock instances in factory (see Mock Factories section)

**Coverage below threshold**
- Check `coverage/index.html` to see uncovered lines
- Add tests for missing branches/statements
- Consider if file should be excluded from coverage

## Future Improvements

Potential enhancements:

1. **Integration Tests**: Test entire command flows end-to-end
2. **Snapshot Tests**: Verify message formatting consistency
3. **Performance Tests**: Ensure handlers respond quickly
4. **CI Integration**: Run tests on GitHub Actions
5. **Coverage Badges**: Display coverage in README
6. **Mutation Testing**: Verify test effectiveness with Stryker

## Contributing

When adding new commands:

1. Create handler in `src/commands/[command].ts`
2. Export from `src/commands/index.ts`
3. Add to bot.ts with `bot.onText(/\/command/, (msg) => handleCommand(msg, deps))`
4. Create test file `tests/unit/commands/[command].test.ts`
5. Write tests covering:
   - Happy path
   - Edge cases
   - Error handling
6. Run `pnpm test:coverage` to verify coverage meets thresholds

## References

- [Vitest Documentation](https://vitest.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
