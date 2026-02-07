/**
 * Unit tests for UniswapV4Service
 * Following official SDK guide: https://docs.uniswap.org/sdk/v4/guides/liquidity/position-fetching
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniswapV4Service } from '../../../src/core/UniswapV4Service';
import { V4Position } from '../../../src/core/types';

// Mock position data factory (simplified structure)
const createMockPosition = (tokenId: string, chainId: number): V4Position => ({
	tokenId,
	chainId,
	chainName: chainId === 1 ? 'Ethereum' : 'Base',
	poolKey: {
		currency0: '0x0000000000000000000000000000000000000000',
		currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
		fee: 500,
		tickSpacing: 10,
		hooks: '0x0000000000000000000000000000000000000000',
	},
	tickLower: -887220,
	tickUpper: 887220,
	liquidity: '1000000',
});

describe('UniswapV4Service', () => {
	let service: UniswapV4Service;
	let getPositionsForChainSpy: any;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new UniswapV4Service();

		// Mock the private getPositionsForChain method to avoid real network calls
		getPositionsForChainSpy = vi
			.spyOn(service as any, 'getPositionsForChain')
			.mockImplementation(
				async (walletAddress: string, chainId: number): Promise<V4Position[]> => {
					// Return empty array for most cases (deterministic)
					// Can be overridden in specific tests
					return [];
				}
			);
	});

	afterEach(() => {
		// Restore the spy to avoid affecting other tests
		if (getPositionsForChainSpy) {
			getPositionsForChainSpy.mockRestore();
		}
	});

	describe('constructor', () => {
		it('should initialize successfully', () => {
			expect(service).toBeDefined();
		});
	});

	describe('getPositions', () => {
		it('should return empty positions for wallet with no positions', async () => {
			// This will fail initially due to network calls, but tests the structure
			const result = await service.getPositions(
				'0x0000000000000000000000000000000000000000'
			);
			expect(result.success).toBe(true);
			expect(Array.isArray(result.positions)).toBe(true);
		});

		it('should accept chainId parameter', async () => {
			const result = await service.getPositions(
				'0x0000000000000000000000000000000000000000',
				1
			);
			expect(result.success).toBe(true);
		});

		it('should return result with correct structure', async () => {
			const result = await service.getPositions(
				'0x0000000000000000000000000000000000000000'
			);

			expect(result).toHaveProperty('success');
			expect(result).toHaveProperty('positions');
			expect(Array.isArray(result.positions)).toBe(true);
		});

		it('should handle invalid chainId gracefully', async () => {
			// Mock getPositionsForChain to throw for invalid chainId
			getPositionsForChainSpy.mockRejectedValueOnce(
				new Error('Unsupported chainId: 99999')
			);

			const result = await service.getPositions(
				'0x0000000000000000000000000000000000000000',
				99999
			);

			// getPositions should still return success: true with chainErrors
			expect(result.success).toBe(true);
			expect(result.chainErrors).toBeDefined();
			expect(result.chainErrors).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						chainId: 99999,
						error: expect.any(String),
					}),
				])
			);
		});
	});

	describe('error handling', () => {
		it('should include chainErrors when chain queries fail', async () => {
			// Mock getPositionsForChain to throw an error for chain 1
			getPositionsForChainSpy.mockRejectedValueOnce(
				new Error('GraphQL query failed')
			);

			const result = await service.getPositions(
				'0x0000000000000000000000000000000000000000',
				1
			);

			// Should still return success: true with chainErrors
			expect(result.success).toBe(true);
			expect(result.chainErrors).toBeDefined();
			expect(Array.isArray(result.chainErrors)).toBe(true);
			expect(result.chainErrors?.length).toBeGreaterThan(0);
		});
	});
});
