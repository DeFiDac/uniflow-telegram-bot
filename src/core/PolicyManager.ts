import { PrivyClient } from '@privy-io/node';
import { Policy, PolicyCreationResult } from './types';
import { PolicyConfig } from './policyConfig';
import axios from 'axios';

export class PolicyManager {
	private privy: PrivyClient;
	private policyIds: string[] = [];
	private initialized: boolean = false;

	constructor(privy: PrivyClient) {
		this.privy = privy;
	}

	/**
	 * Initialize policies - idempotent operation
	 */
	async initialize(): Promise<PolicyCreationResult> {
		try {
			// Validate required environment variables
			const signerId = process.env.PRIVY_SIGNER_ID;
			if (!signerId) {
				throw new Error(
					'PRIVY_SIGNER_ID not configured. ' +
						'Please set this environment variable to your authorization key ID.'
				);
			}

			const appId = process.env.PRIVY_APP_ID;
			const appSecret = process.env.PRIVY_APP_SECRET;
			if (!appId || !appSecret) {
				throw new Error(
					'Privy credentials not configured. ' +
						'Please set PRIVY_APP_ID and PRIVY_APP_SECRET environment variables.'
				);
			}

			// Check if policy already exists
			console.log('[PolicyManager] Checking for existing policies...');
			const existingPolicy = await this.findPolicyByName('UniFlow Conservative Security Policy');

			if (existingPolicy) {
				console.log(`[PolicyManager] Found existing policy: ${existingPolicy.id}`);
				this.policyIds = [existingPolicy.id];
				this.validatePolicy(existingPolicy);
			} else {
				console.log('[PolicyManager] Creating new security policy...');
				const policy = await this.createPolicy(signerId);
				this.policyIds = [policy.id];
				console.log(`[PolicyManager] Created policy: ${policy.id}`);
			}

			this.initialized = true;
			return {
				success: true,
				policyIds: this.policyIds,
			};
		} catch (error) {
			// Provide detailed error context
			let errorMessage = 'Policy initialization failed';
			let troubleshootingSteps: string[] = [];

			if (axios.isAxiosError(error)) {
				if (error.response?.status === 401 || error.response?.status === 403) {
					errorMessage = 'Privy API authentication failed';
					troubleshootingSteps = [
						'1. Verify PRIVY_APP_ID and PRIVY_APP_SECRET are correct',
						'2. Check that credentials have policy creation permissions',
						'3. Ensure the Privy app is active (not suspended)',
					];
				} else if (error.response?.status === 429) {
					errorMessage = 'Privy API rate limit exceeded';
					troubleshootingSteps = [
						'1. Wait a few minutes before restarting',
						'2. Check for other services making excessive API calls',
						'3. Contact Privy support if issue persists',
					];
				} else {
					errorMessage = `Privy API error (${error.response?.status || 'unknown'})`;
					troubleshootingSteps = [
						'1. Check Privy status page for outages',
						'2. Review error details below',
						'3. Contact Privy support if needed',
					];
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			console.error('[PolicyManager] Initialization failed:', errorMessage);
			if (troubleshootingSteps.length > 0) {
				console.error('[PolicyManager] Troubleshooting steps:');
				troubleshootingSteps.forEach((step) => console.error(`   ${step}`));
			}
			console.error('[PolicyManager] Full error:', error);

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Get cached policy IDs
	 */
	getPolicyIds(): string[] {
		if (!this.initialized) {
			throw new Error('PolicyManager not initialized');
		}
		return this.policyIds;
	}

	/**
	 * Find existing policy by name
	 */
	private async findPolicyByName(name: string): Promise<Policy | null> {
		const appId = process.env.PRIVY_APP_ID;
		const appSecret = process.env.PRIVY_APP_SECRET;

		try {
			const response = await axios.get('https://api.privy.io/v1/policies', {
				auth: { username: appId!, password: appSecret! },
				headers: { 'privy-app-id': appId! },
			});

			const policies = response.data;
			return policies.find((p: Policy) => p.name === name) || null;
		} catch (error) {
			if (axios.isAxiosError(error) && error.response?.status === 404) {
				return null;
			}
			throw error;
		}
	}

	/**
	 * Create new policy
	 */
	private async createPolicy(ownerId: string): Promise<Policy> {
		const appId = process.env.PRIVY_APP_ID;
		const appSecret = process.env.PRIVY_APP_SECRET;
		const policyDef = PolicyConfig.getPolicyDefinition(ownerId);

		const response = await axios.post('https://api.privy.io/v1/policies', policyDef, {
			auth: { username: appId!, password: appSecret! },
			headers: {
				'privy-app-id': appId!,
				'Content-Type': 'application/json',
			},
		});

		return response.data;
	}

	/**
	 * Validate existing policy
	 */
	private validatePolicy(policy: Policy): void {
		const expected = PolicyConfig.getPolicyDefinition(policy.owner_id);

		if (policy.rules.length !== expected.rules.length) {
			console.warn('[PolicyManager] WARNING: Existing policy has different number of rules');
		}

		if (policy.owner_id !== process.env.PRIVY_SIGNER_ID) {
			console.warn('[PolicyManager] WARNING: Policy owner_id mismatch');
		}
	}
}
