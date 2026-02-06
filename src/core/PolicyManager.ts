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

			// Check if policy ID is provided via environment variable
			const existingPolicyId = process.env.PRIVY_POLICY_ID;
			if (existingPolicyId) {
				console.log(`[PolicyManager] Verifying existing policy: ${existingPolicyId}`);
				// Verify the policy exists by fetching it
				const policy = await this.getPolicy(existingPolicyId);
				this.policyIds = [policy.id];
				this.validatePolicy(policy);
				console.log(`[PolicyManager] Using existing policy: ${policy.id}`);
				this.initialized = true;
				return {
					success: true,
					policyIds: this.policyIds,
				};
			}

			// Create new policy
			console.log('[PolicyManager] Creating new security policy...');
			const policy = await this.createPolicy(signerId);
			this.policyIds = [policy.id];
			console.log(`[PolicyManager] Created policy: ${policy.id}`);
			console.log(
				`[PolicyManager] 💡 TIP: Set PRIVY_POLICY_ID=${policy.id} in .env to skip policy creation on restart`
			);

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
	 * Get existing policy by ID
	 */
	private async getPolicy(policyId: string): Promise<Policy> {
		const appId = process.env.PRIVY_APP_ID;
		const appSecret = process.env.PRIVY_APP_SECRET;

		const response = await axios.get(`https://api.privy.io/v1/policies/${policyId}`, {
			auth: { username: appId!, password: appSecret! },
			headers: { 'privy-app-id': appId! },
		});

		return response.data;
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
	 * Validate existing policy matches expected configuration
	 * Throws error if policy doesn't match security requirements
	 */
	private validatePolicy(policy: Policy): void {
		// Ensure PRIVY_SIGNER_ID is configured
		const expectedSignerId = process.env.PRIVY_SIGNER_ID;
		if (!expectedSignerId) {
			throw new Error('PRIVY_SIGNER_ID environment variable is not set');
		}

		// Fail fast if owner doesn't match - security critical
		if (policy.owner_id !== expectedSignerId) {
			throw new Error(
				`Policy owner mismatch: expected '${expectedSignerId}', but policy is owned by '${policy.owner_id}'. ` +
					`This policy cannot be used for security reasons.`
			);
		}

		// Build expected configuration using the correct signer ID
		const expected = PolicyConfig.getPolicyDefinition(expectedSignerId);

		// Fail fast if rule count doesn't match
		if (policy.rules.length !== expected.rules.length) {
			throw new Error(
				`Policy rule count mismatch: expected ${expected.rules.length} rule(s), but policy has ${policy.rules.length} rule(s). ` +
					`Policy configuration does not match security requirements.`
			);
		}

		// Validate condition count in the composite rule
		const expectedConditionCount = expected.rules[0]?.conditions?.length || 0;
		const actualConditionCount = policy.rules[0]?.conditions?.length || 0;
		if (expectedConditionCount !== actualConditionCount) {
			throw new Error(
				`Policy condition count mismatch: expected ${expectedConditionCount} condition(s), but policy has ${actualConditionCount} condition(s). ` +
					`Policy configuration does not match security requirements.`
			);
		}
	}
}
