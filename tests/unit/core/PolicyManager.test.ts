import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PolicyManager } from '../../../src/core/PolicyManager';
import axios from 'axios';

vi.mock('axios');

describe('PolicyManager', () => {
	let policyManager: PolicyManager;
	let mockPrivy: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPrivy = {};
		policyManager = new PolicyManager(mockPrivy);

		process.env.PRIVY_APP_ID = 'test-app-id';
		process.env.PRIVY_APP_SECRET = 'test-app-secret';
		process.env.PRIVY_SIGNER_ID = 'test-signer-id';
		delete process.env.PRIVY_POLICY_ID; // Ensure clean state
	});

	afterEach(() => {
		delete process.env.PRIVY_POLICY_ID;
	});

	it('should create new policy when PRIVY_POLICY_ID not set', async () => {
		// Mock POST returns new policy
		vi.mocked(axios.post).mockResolvedValue({
			data: {
				id: 'policy-123',
				name: 'UniFlow Conservative Security Policy',
				rules: [{ conditions: [{}, {}, {}] }],
				owner_id: 'test-signer-id',
				created_at: Date.now(),
			},
		});

		const result = await policyManager.initialize();

		expect(result.success).toBe(true);
		expect(result.policyIds).toEqual(['policy-123']);
		expect(axios.post).toHaveBeenCalledOnce();
		expect(axios.get).not.toHaveBeenCalled();
	});

	it('should retrieve and validate existing policy when PRIVY_POLICY_ID is set', async () => {
		process.env.PRIVY_POLICY_ID = 'existing-policy-456';

		// Mock GET returns existing policy
		vi.mocked(axios.get).mockResolvedValue({
			data: {
				id: 'existing-policy-456',
				name: 'UniFlow Conservative Security Policy',
				rules: [{ conditions: [{}, {}, {}] }],
				owner_id: 'test-signer-id',
				created_at: Date.now(),
			},
		});

		const result = await policyManager.initialize();

		expect(result.success).toBe(true);
		expect(result.policyIds).toEqual(['existing-policy-456']);
		expect(axios.get).toHaveBeenCalledWith(
			'https://api.privy.io/v1/policies/existing-policy-456',
			expect.objectContaining({
				headers: { 'privy-app-id': 'test-app-id' },
			})
		);
		expect(axios.post).not.toHaveBeenCalled();
	});

	it('should fail if PRIVY_SIGNER_ID is missing', async () => {
		delete process.env.PRIVY_SIGNER_ID;

		const result = await policyManager.initialize();

		expect(result.success).toBe(false);
		expect(result.error).toContain('PRIVY_SIGNER_ID');
	});

	it('should handle error when fetching non-existent policy', async () => {
		process.env.PRIVY_POLICY_ID = 'non-existent-policy';

		// Mock GET returns 404
		const notFoundError = Object.assign(new Error('Not Found'), {
			response: { status: 404 },
		});
		vi.mocked(axios.get).mockRejectedValue(notFoundError);

		const result = await policyManager.initialize();

		expect(result.success).toBe(false);
	});

	it('should throw error if getPolicyIds called before initialize', () => {
		expect(() => policyManager.getPolicyIds()).toThrow('not initialized');
	});
});
