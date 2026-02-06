import { UNISWAP_V4_DEPLOYMENTS } from '../constants';
import { PolicyRule } from './types';

export class PolicyConfig {
	/**
	 * Generate chain allowlist rule - only allow transactions on supported chains
	 */
	static getChainAllowlistRule(): PolicyRule {
		const allowedChains = Object.values(UNISWAP_V4_DEPLOYMENTS).map((d) => d.chainId);

		return {
			name: 'Chain Allowlist',
			method: 'eth_sendTransaction',
			conditions: [
				{
					field_source: 'ethereum_transaction',
					field: 'chain_id',
					operator: 'in',
					value: allowedChains,
				},
			],
			action: 'ALLOW',
		};
	}

	/**
	 * Generate contract allowlist rule - only allow Uniswap V4 contracts
	 */
	static getContractAllowlistRule(): PolicyRule {
		const allowedContracts = Object.values(UNISWAP_V4_DEPLOYMENTS).flatMap((deployment) => [
			deployment.poolManager.toLowerCase(),
			deployment.positionManager.toLowerCase(),
			deployment.stateView.toLowerCase(),
		]);

		return {
			name: 'Uniswap V4 Contract Allowlist',
			method: 'eth_sendTransaction',
			conditions: [
				{
					field_source: 'ethereum_transaction',
					field: 'to',
					operator: 'in',
					value: allowedContracts,
				},
			],
			action: 'ALLOW',
		};
	}

	/**
	 * Generate value limit rule - max 0.1 ETH per transaction
	 */
	static getValueLimitRule(): PolicyRule {
		return {
			name: 'Transaction Value Limit',
			method: 'eth_sendTransaction',
			conditions: [
				{
					field_source: 'ethereum_transaction',
					field: 'value',
					operator: 'lte',
					value: '100000000000000000', // 0.1 ETH in wei
				},
			],
			action: 'ALLOW',
		};
	}

	/**
	 * Get complete policy definition
	 */
	static getPolicyDefinition(ownerId: string) {
		return {
			version: '1.0',
			name: 'UniFlow Conservative Security Policy',
			chain_type: 'ethereum',
			owner_id: ownerId,
			rules: [
				this.getChainAllowlistRule(),
				this.getContractAllowlistRule(),
				this.getValueLimitRule(),
			],
		};
	}
}
