import { describe, it, expect } from 'vitest';
import { PolicyConfig } from '../../../src/core/policyConfig';
import { UNISWAP_V4_DEPLOYMENTS } from '../../../src/constants';

describe('PolicyConfig', () => {
	describe('getChainAllowlistCondition', () => {
		it('should include all supported chain IDs', () => {
			const condition = PolicyConfig.getChainAllowlistCondition();

			expect(condition.field_source).toBe('ethereum_transaction');
			expect(condition.field).toBe('chain_id');
			expect(condition.operator).toBe('in');

			const allowedChains = condition.value as number[];
			expect(allowedChains).toContain(1); // ethereum
			expect(allowedChains).toContain(42161); // arbitrum
			expect(allowedChains).toContain(8453); // base
			expect(allowedChains).toContain(130); // unichain
			expect(allowedChains).toContain(56); // bsc
		});
	});

	describe('getContractAllowlistCondition', () => {
		it('should include all Uniswap V4 contract addresses', () => {
			const condition = PolicyConfig.getContractAllowlistCondition();
			const allowedAddresses = condition.value as string[];

			// Verify each network's contracts are included
			Object.values(UNISWAP_V4_DEPLOYMENTS).forEach((deployment) => {
				expect(allowedAddresses).toContain(deployment.poolManager.toLowerCase());
				expect(allowedAddresses).toContain(deployment.positionManager.toLowerCase());
				expect(allowedAddresses).toContain(deployment.stateView.toLowerCase());
			});
		});

		it('should use lowercase addresses', () => {
			const condition = PolicyConfig.getContractAllowlistCondition();
			const allowedAddresses = condition.value as string[];

			allowedAddresses.forEach((addr) => {
				expect(addr).toBe(addr.toLowerCase());
			});
		});
	});

	describe('getValueLimitCondition', () => {
		it('should limit to 0.1 ETH', () => {
			const condition = PolicyConfig.getValueLimitCondition();

			expect(condition.field).toBe('value');
			expect(condition.operator).toBe('lte');
			expect(condition.value).toBe('100000000000000000'); // 0.1 ETH in wei
		});
	});

	describe('getCompositeAllowRule', () => {
		it('should combine all conditions into a single AND rule', () => {
			const rule = PolicyConfig.getCompositeAllowRule();

			expect(rule.name).toBe('UniFlow Composite Security Rule');
			expect(rule.method).toBe('eth_sendTransaction');
			expect(rule.action).toBe('ALLOW');
			expect(rule.conditions).toHaveLength(3);

			// Verify chain condition
			const chainCondition = rule.conditions.find((c) => c.field === 'chain_id');
			expect(chainCondition).toBeDefined();
			expect(chainCondition?.operator).toBe('in');

			// Verify contract condition
			const contractCondition = rule.conditions.find((c) => c.field === 'to');
			expect(contractCondition).toBeDefined();
			expect(contractCondition?.operator).toBe('in');

			// Verify value condition
			const valueCondition = rule.conditions.find((c) => c.field === 'value');
			expect(valueCondition).toBeDefined();
			expect(valueCondition?.operator).toBe('lte');
			expect(valueCondition?.value).toBe('100000000000000000');
		});
	});

	describe('getPolicyDefinition', () => {
		it('should create policy with single composite rule', () => {
			const policy = PolicyConfig.getPolicyDefinition('test-owner-id');

			expect(policy.version).toBe('1.0');
			expect(policy.name).toBe('UniFlow Conservative Security Policy');
			expect(policy.chain_type).toBe('ethereum');
			expect(policy.owner_id).toBe('test-owner-id');
			expect(policy.rules).toHaveLength(1);
		});

		it('should have composite rule with all conditions (AND semantics)', () => {
			const policy = PolicyConfig.getPolicyDefinition('test-owner-id');
			const compositeRule = policy.rules[0];

			expect(compositeRule.conditions).toHaveLength(3);
			expect(compositeRule.action).toBe('ALLOW');

			// All three conditions must be present for AND semantics
			const hasChainCondition = compositeRule.conditions.some((c) => c.field === 'chain_id');
			const hasContractCondition = compositeRule.conditions.some((c) => c.field === 'to');
			const hasValueCondition = compositeRule.conditions.some((c) => c.field === 'value');

			expect(hasChainCondition).toBe(true);
			expect(hasContractCondition).toBe(true);
			expect(hasValueCondition).toBe(true);
		});
	});
});
