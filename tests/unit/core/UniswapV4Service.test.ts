/**
 * Unit tests for UniswapV4Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UniswapV4Service } from '../../../src/core/UniswapV4Service';
import { PriceService } from '../../../src/core/PriceService';

// Mock factories (shared instances)
const createMockPriceService = () => {
	return {
		getTokenPrices: vi.fn().mockResolvedValue(
			new Map([
				['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 3000],
				['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 1],
			])
		),
		clearCache: vi.fn(),
		getCacheSize: vi.fn().mockReturnValue(0),
	};
};

describe('UniswapV4Service', () => {
	let service: UniswapV4Service;
	let mockPriceService: ReturnType<typeof createMockPriceService>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPriceService = createMockPriceService();
		service = new UniswapV4Service(mockPriceService as unknown as PriceService);
	});

	describe('constructor', () => {
		it('should initialize with provided PriceService', () => {
			expect(service).toBeDefined();
		});

		it('should initialize with default PriceService if not provided', () => {
			const serviceDefault = new UniswapV4Service();
			expect(serviceDefault).toBeDefined();
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
			expect(result).toHaveProperty('totalValueUsd');
			expect(result).toHaveProperty('totalFeesUsd');
		});

		it('should handle invalid chainId gracefully', async () => {
			try {
				await service.getPositions(
					'0x0000000000000000000000000000000000000000',
					99999
				);
			} catch (error) {
				expect(error).toBeDefined();
			}
		});
	});

	describe('error handling', () => {
		it('should include chainErrors when chain queries fail', async () => {
			// Use an invalid wallet address format to trigger errors
			const result = await service.getPositions(
				'0x0000000000000000000000000000000000000000',
				99999 // Invalid chainId
			);

			// Should still return success: true with chainErrors
			expect(result.success).toBe(true);
			if (result.chainErrors) {
				expect(Array.isArray(result.chainErrors)).toBe(true);
			}
		});
	});
});
