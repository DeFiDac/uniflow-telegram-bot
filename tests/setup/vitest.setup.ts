import { beforeEach, vi } from 'vitest';

// Global test setup
beforeEach(() => {
	// Clear all mocks before each test
	vi.clearAllMocks();

	// Set required environment variables for tests
	process.env.PRIVY_SIGNER_ID = 'test_signer_id';

	// Reset console methods to avoid noise in tests
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
