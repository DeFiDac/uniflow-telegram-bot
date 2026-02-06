import { getAddress } from 'viem';
import { UNISWAP_V4_DEPLOYMENTS } from '../constants';
import { PolicyRule, PolicyCondition } from './types';

export class PolicyConfig {
	/**
	 * Generate chain allowlist condition - only allow transactions on supported chains
	 */
	static getChainAllowlistCondition(): PolicyCondition {
		// Convert chain IDs to strings as required by Privy API
		const allowedChains = Object.values(UNISWAP_V4_DEPLOYMENTS).map((d) => String(d.chainId));

		return {
			field_source: 'ethereum_transaction',
			field: 'chain_id',
			operator: 'in',
			value: allowedChains,
		};
	}

	/**
	 * Generate contract allowlist condition - only allow Uniswap V4 contracts
	 * Uses EIP-55 checksummed addresses for case-sensitive matching
	 */
	static getContractAllowlistCondition(): PolicyCondition {
		const allowedContracts = Object.values(UNISWAP_V4_DEPLOYMENTS).flatMap((deployment) => [
			getAddress(deployment.poolManager),
			getAddress(deployment.positionManager),
			getAddress(deployment.stateView),
		]);

		return {
			field_source: 'ethereum_transaction',
			field: 'to',
			operator: 'in',
			value: allowedContracts,
		};
	}

	/**
	 * Generate value limit condition - max 0.1 ETH per transaction
	 */
	static getValueLimitCondition(): PolicyCondition {
		return {
			field_source: 'ethereum_transaction',
			field: 'value',
			operator: 'lte',
			value: '100000000000000000', // 0.1 ETH in wei
		};
	}

	/**
	 * Generate composite allow rule that ANDs all conditions
	 * A transaction is allowed only if it passes chain, contract, AND value checks
	 */
	static getCompositeAllowRule(): PolicyRule {
		return {
			name: 'UniFlow Composite Security Rule',
			method: 'eth_sendTransaction',
			conditions: [
				this.getChainAllowlistCondition(),
				this.getContractAllowlistCondition(),
				this.getValueLimitCondition(),
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
			rules: [this.getCompositeAllowRule()],
		};
	}
}
