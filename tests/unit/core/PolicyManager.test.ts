import { describe, it, expect, beforeEach, vi } from 'vitest';
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
	});

	it('should create policy if none exists', async () => {
		// Mock GET returns empty array
		vi.mocked(axios.get).mockResolvedValue({ data: [] });

		// Mock POST returns new policy
		vi.mocked(axios.post).mockResolvedValue({
			data: {
				id: 'policy-123',
				name: 'UniFlow Conservative Security Policy',
				rules: [],
				owner_id: 'test-signer-id',
				created_at: Date.now(),
			},
		});

		const result = await policyManager.initialize();

		expect(result.success).toBe(true);
		expect(result.policyIds).toEqual(['policy-123']);
		expect(axios.post).toHaveBeenCalledOnce();
	});

	it('should reuse existing policy', async () => {
		// Mock GET returns existing policy with composite rule
		vi.mocked(axios.get).mockResolvedValue({
			data: [
				{
					id: 'existing-policy-456',
					name: 'UniFlow Conservative Security Policy',
					rules: [{ conditions: [{}, {}, {}] }], // Single rule with 3 conditions
					owner_id: 'test-signer-id',
					created_at: Date.now(),
				},
			],
		});

		const result = await policyManager.initialize();

		expect(result.success).toBe(true);
		expect(result.policyIds).toEqual(['existing-policy-456']);
		expect(axios.post).not.toHaveBeenCalled();
	});

	it('should fail if PRIVY_SIGNER_ID is missing', async () => {
		delete process.env.PRIVY_SIGNER_ID;

		const result = await policyManager.initialize();

		expect(result.success).toBe(false);
		expect(result.error).toContain('PRIVY_SIGNER_ID');
	});

	it('should throw error if getPolicyIds called before initialize', () => {
		expect(() => policyManager.getPolicyIds()).toThrow('not initialized');
	});
});
