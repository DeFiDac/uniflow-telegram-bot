/**
 * Server module tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing server
vi.mock('@privy-io/node', () => ({
	PrivyClient: class PrivyClient {
		constructor() {}
	},
	APIError: class APIError extends Error {},
}));

vi.mock('../../src/core', () => ({
	WalletService: vi.fn(),
	PolicyManager: vi.fn(() => ({
		initialize: vi.fn().mockResolvedValue({
			success: false,
			error: 'Mock initialization blocked for test',
		}),
	})),
	UniswapV4Service: vi.fn(),
}));

vi.mock('../../src/api', () => ({
	createRouter: vi.fn(() => ({})),
	errorHandler: vi.fn(),
	requestLogger: vi.fn(),
}));

describe('Server Module', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Set required env vars
		process.env.PRIVY_APP_ID = 'test-app-id';
		process.env.PRIVY_APP_SECRET = 'test-secret';
		process.env.PRIVY_SIGNER_ID = 'test-signer-id';
		process.env.PRIVY_SIGNER_PRIVATE_KEY = 'test-key';

		// Mock process.exit to prevent actual exit during tests
		vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
	});

	describe('getWalletService', () => {
		it('should throw error when WalletService is not initialized', async () => {
			// Import getWalletService - server won't start due to mock blocking initialization
			const { getWalletService } = await import('../../src/server');

			expect(() => getWalletService()).toThrow(
				'WalletService not initialized. Wait for server startup to complete before accessing WalletService.'
			);
		});
	});
});
