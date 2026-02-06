import { describe, it, expect } from 'vitest';
import { PolicyConfig } from '../../../src/core/policyConfig';
import { UNISWAP_V4_DEPLOYMENTS } from '../../../src/constants';

describe('PolicyConfig', () => {
	describe('getChainAllowlistRule', () => {
		it('should include all supported chain IDs', () => {
			const rule = PolicyConfig.getChainAllowlistRule();

			expect(rule.name).toBe('Chain Allowlist');
			expect(rule.method).toBe('eth_sendTransaction');
			expect(rule.action).toBe('ALLOW');
			expect(rule.conditions[0].field).toBe('chain_id');
			expect(rule.conditions[0].operator).toBe('in');

			const allowedChains = rule.conditions[0].value as number[];
			expect(allowedChains).toContain(1); // ethereum
			expect(allowedChains).toContain(42161); // arbitrum
			expect(allowedChains).toContain(8453); // base
			expect(allowedChains).toContain(130); // unichain
			expect(allowedChains).toContain(56); // bsc
		});
	});

	describe('getContractAllowlistRule', () => {
		it('should include all Uniswap V4 contract addresses', () => {
			const rule = PolicyConfig.getContractAllowlistRule();
			const allowedAddresses = rule.conditions[0].value as string[];

			// Verify each network's contracts are included
			Object.values(UNISWAP_V4_DEPLOYMENTS).forEach((deployment) => {
				expect(allowedAddresses).toContain(deployment.poolManager.toLowerCase());
				expect(allowedAddresses).toContain(deployment.positionManager.toLowerCase());
				expect(allowedAddresses).toContain(deployment.stateView.toLowerCase());
			});
		});

		it('should use lowercase addresses', () => {
			const rule = PolicyConfig.getContractAllowlistRule();
			const allowedAddresses = rule.conditions[0].value as string[];

			allowedAddresses.forEach((addr) => {
				expect(addr).toBe(addr.toLowerCase());
			});
		});
	});

	describe('getValueLimitRule', () => {
		it('should limit to 0.1 ETH', () => {
			const rule = PolicyConfig.getValueLimitRule();

			expect(rule.conditions[0].field).toBe('value');
			expect(rule.conditions[0].operator).toBe('lte');
			expect(rule.conditions[0].value).toBe('100000000000000000'); // 0.1 ETH in wei
		});
	});

	describe('getPolicyDefinition', () => {
		it('should create complete policy with all rules', () => {
			const policy = PolicyConfig.getPolicyDefinition('test-owner-id');

			expect(policy.version).toBe('1.0');
			expect(policy.name).toBe('UniFlow Conservative Security Policy');
			expect(policy.chain_type).toBe('ethereum');
			expect(policy.owner_id).toBe('test-owner-id');
			expect(policy.rules).toHaveLength(3);
		});
	});
});
