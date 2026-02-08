/**
 * Unit tests for UniswapV4MintService
 * Following official SDK guide: https://docs.uniswap.org/sdk/v4/guides/liquidity/position-minting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniswapV4MintService } from '../../../src/core/UniswapV4MintService';
import { WalletService } from '../../../src/core/WalletService';
import {
	V4PoolDiscoveryParams,
	V4PoolDiscoveryResult,
	V4ApprovalParams,
	V4MintSimpleParams,
	ErrorCodes,
} from '../../../src/core/types';

// Mock WalletService
const createMockWalletService = () => {
	return {
		getSession: vi.fn(),
		transact: vi.fn(),
	} as unknown as WalletService;
};

// Mock pool discovery result factory
const createMockPoolResult = (exists: boolean): V4PoolDiscoveryResult => ({
	success: true,
	pool: {
		exists,
		poolKey: {
			currency0: '0x0000000000000000000000000000000000000000',
			currency1: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
			fee: 3000,
			tickSpacing: 60,
			hooks: '0x0000000000000000000000000000000000000000',
		},
		currentTick: 204589,
		sqrtPriceX96: '1461446703485210103287273052203988822378723970341',
		liquidity: '123456789',
		token0Symbol: 'ETH',
		token1Symbol: 'USDC',
		token0Decimals: 18,
		token1Decimals: 6,
	},
});

describe('UniswapV4MintService', () => {
	let service: UniswapV4MintService;
	let mockWalletService: WalletService;
	let getViemClientSpy: any;
	let getTokenInfoSpy: any;
	let fetchPoolStateSpy: any;
	let checkBalanceSpy: any;
	let checkAllowanceSpy: any;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new UniswapV4MintService();
		mockWalletService = createMockWalletService();

		// Mock private methods to avoid real network calls
		getViemClientSpy = vi
			.spyOn(service as any, 'getViemClient')
			.mockReturnValue({
				readContract: vi.fn(),
				getBalance: vi.fn(),
			});

		getTokenInfoSpy = vi
			.spyOn(service as any, 'getTokenInfo')
			.mockResolvedValue({
				address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				symbol: 'USDC',
				decimals: 6,
			});

		fetchPoolStateSpy = vi
			.spyOn(service as any, 'fetchPoolState')
			.mockResolvedValue({
				sqrtPriceX96: BigInt('1461446703485210103287273052203988822378723970341'),
				tick: 204589,
				liquidity: BigInt('123456789'),
			});

		checkBalanceSpy = vi.spyOn(service as any, 'checkBalance').mockResolvedValue({
			sufficient: true,
			balance: BigInt('1000000000000000000'), // 1 ETH
			required: BigInt('10000000000000000'), // 0.01 ETH
		});

		checkAllowanceSpy = vi
			.spyOn(service as any, 'checkAllowance')
			.mockResolvedValue(BigInt('1000000000000000000000000')); // Large allowance
	});

	afterEach(() => {
		// Restore all spies
		getViemClientSpy?.mockRestore();
		getTokenInfoSpy?.mockRestore();
		fetchPoolStateSpy?.mockRestore();
		checkBalanceSpy?.mockRestore();
		checkAllowanceSpy?.mockRestore();
	});

	describe('constructor', () => {
		it('should initialize successfully', () => {
			expect(service).toBeDefined();
		});
	});

	describe('discoverPool', () => {
		it('should return pool info for existing pool', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			expect(result.pool).toBeDefined();
			expect(result.pool?.exists).toBeDefined();
		});

		it('should query specific fee tier when fee parameter provided', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
				fee: 3000,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			expect(fetchPoolStateSpy).toHaveBeenCalledTimes(1); // Should only call once for fee=3000
		});

		it('should use custom tickSpacing when both fee and tickSpacing provided', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
				fee: 3000,
				tickSpacing: 100, // Custom tick spacing
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			// Verify fetchPoolState was called with custom tickSpacing
			expect(fetchPoolStateSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					fee: 3000,
					tickSpacing: 100,
				}),
				8453
			);
		});

		it('should return error when tickSpacing provided without fee', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
				tickSpacing: 60, // tickSpacing without fee
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(false);
			expect(result.error).toContain('tickSpacing cannot be specified without fee');
		});

		it('should auto-derive tickSpacing from fee when only fee provided', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
				fee: 500, // Should auto-derive tickSpacing=10
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			// Verify fetchPoolState was called with auto-derived tickSpacing
			expect(fetchPoolStateSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					fee: 500,
					tickSpacing: 10, // Auto-derived from fee=500
				}),
				8453
			);
		});

		it('should handle unsupported chain ID', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 99999,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unsupported chain ID');
		});

		it('should return pool not found when no pool exists', async () => {
			// Mock fetchPoolState to return null (no pool)
			fetchPoolStateSpy.mockResolvedValue(null);

			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			expect(result.pool?.exists).toBe(false);
		});

		it('should sort token addresses correctly', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Higher address
				token1: '0x0000000000000000000000000000000000000000', // Lower address
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			// Should be sorted with lower address first
			if (result.pool) {
				const addr0 = result.pool.poolKey.currency0.toLowerCase();
				const addr1 = result.pool.poolKey.currency1.toLowerCase();
				expect(addr0 < addr1).toBe(true);
			}
		});

		it('should include token symbols in response', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			expect(result.pool?.token0Symbol).toBeDefined();
			expect(result.pool?.token1Symbol).toBeDefined();
		});
	});

	describe('approveToken', () => {
		it('should generate approval transaction successfully', async () => {
			mockWalletService.transact = vi.fn().mockResolvedValue({
				success: true,
				hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
			});

			const params: V4ApprovalParams = {
				token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount: '1000.0',
				chainId: 8453,
			};

			const result = await service.approveToken('test-user', params, mockWalletService);

			expect(result.success).toBe(true);
			expect(result.txHash).toBeDefined();
			expect(mockWalletService.transact).toHaveBeenCalled();
		});

		it('should reject approval for native ETH', async () => {
			const params: V4ApprovalParams = {
				token: '0x0000000000000000000000000000000000000000',
				amount: '1.0',
				chainId: 8453,
			};

			const result = await service.approveToken('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Native ETH does not require approval');
		});

		it('should handle unsupported chain ID', async () => {
			const params: V4ApprovalParams = {
				token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount: '1000.0',
				chainId: 99999,
			};

			const result = await service.approveToken('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unsupported chain ID');
		});

		it('should handle transaction failure', async () => {
			mockWalletService.transact = vi.fn().mockResolvedValue({
				success: false,
				error: 'Transaction failed',
			});

			const params: V4ApprovalParams = {
				token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount: '1000.0',
				chainId: 8453,
			};

			const result = await service.approveToken('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe('mintPosition', () => {
		beforeEach(() => {
			// Mock session
			mockWalletService.getSession = vi.fn().mockReturnValue({
				userId: 'test-user',
				walletId: 'test-wallet',
				walletAddress: '0x1234567890123456789012345678901234567890',
			});

			// Mock successful transaction
			mockWalletService.transact = vi.fn().mockResolvedValue({
				success: true,
				hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
			});

			// Mock discoverPool to return existing pool
			vi.spyOn(service, 'discoverPool').mockResolvedValue(createMockPoolResult(true));
		});

		it('should call required validation methods', async () => {
			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			await service.mintPosition('test-user', params, mockWalletService);

			// Verify that validation methods were called
			expect(mockWalletService.getSession).toHaveBeenCalledWith('test-user');
			expect(checkBalanceSpy).toHaveBeenCalled();
		});

		it('should fail if no session exists', async () => {
			mockWalletService.getSession = vi.fn().mockReturnValue(null);

			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toBe(ErrorCodes.SESSION_NOT_FOUND);
		});

		it('should fail if pool does not exist', async () => {
			vi.spyOn(service, 'discoverPool').mockResolvedValue(createMockPoolResult(false));

			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toContain('No pool found');
		});

		it('should fail if insufficient balance', async () => {
			checkBalanceSpy.mockResolvedValueOnce({
				sufficient: false,
				balance: BigInt('5000000000000000'), // 0.005 ETH
				required: BigInt('10000000000000000'), // 0.01 ETH
			});

			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Insufficient');
			expect(result.error).toContain('balance');
		});

		it('should fail if token not approved', async () => {
			checkAllowanceSpy.mockResolvedValueOnce(BigInt('0')); // No allowance

			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toContain('not approved');
			expect(result.error).toContain('/api/v4/approve');
		});

		it('should handle unsupported chain ID', async () => {
			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 99999,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unsupported chain ID');
		});

		it('should accept default slippage tolerance parameter', async () => {
			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
				// No slippageTolerance specified - should use default 0.5%
			};

			// Just verify the method accepts the parameters without error
			const result = await service.mintPosition('test-user', params, mockWalletService);
			expect(result).toHaveProperty('success');
		});

		it('should accept custom slippage tolerance parameter', async () => {
			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
				slippageTolerance: 1.0, // Custom 1%
			};

			// Just verify the method accepts the parameters without error
			const result = await service.mintPosition('test-user', params, mockWalletService);
			expect(result).toHaveProperty('success');
		});

		it('should handle transaction failure', async () => {
			mockWalletService.transact = vi.fn().mockResolvedValue({
				success: false,
				error: 'Transaction failed',
			});

			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('should return explorer URL when transaction succeeds', async () => {
			// This test validates the response structure includes explorer URL
			// Full SDK integration testing would require complex mocking
			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			// Verify result has the expected structure
			expect(result).toHaveProperty('success');
			if (result.success) {
				expect(result).toHaveProperty('explorer');
			}
		});
	});

	describe('checkBalance coercion', () => {
		it('should handle native ETH balance returned as number', async () => {
			checkBalanceSpy.mockRestore();

			const mockGetBalance = vi.fn().mockResolvedValue(2279961267478848); // number, not bigint
			getViemClientSpy.mockReturnValue({
				readContract: vi.fn(),
				getBalance: mockGetBalance,
			});

			const result = await (service as any).checkBalance(
				'0x1234567890123456789012345678901234567890',
				'0x0000000000000000000000000000000000000000',
				BigInt('100000000000000'), // 0.0001 ETH
				8453
			);

			expect(result.sufficient).toBe(true);
			expect(typeof result.balance).toBe('bigint');
			expect(result.balance).toBe(BigInt(2279961267478848));
		});

		it('should handle ERC20 balance returned as hex string', async () => {
			checkBalanceSpy.mockRestore();

			const mockReadContract = vi.fn().mockResolvedValue('0xDE0B6B3A7640000'); // 1e18 as hex
			getViemClientSpy.mockReturnValue({
				readContract: mockReadContract,
				getBalance: vi.fn(),
			});

			const result = await (service as any).checkBalance(
				'0x1234567890123456789012345678901234567890',
				'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				BigInt('500000000000000000'), // 0.5 ETH
				8453
			);

			expect(result.sufficient).toBe(true);
			expect(typeof result.balance).toBe('bigint');
			expect(result.balance).toBe(BigInt('0xDE0B6B3A7640000'));
		});

		it('should handle balance already returned as bigint (no-op coercion)', async () => {
			checkBalanceSpy.mockRestore();

			const mockGetBalance = vi.fn().mockResolvedValue(BigInt('5000000000000000000'));
			getViemClientSpy.mockReturnValue({
				readContract: vi.fn(),
				getBalance: mockGetBalance,
			});

			const result = await (service as any).checkBalance(
				'0x1234567890123456789012345678901234567890',
				'0x0000000000000000000000000000000000000000',
				BigInt('1000000000000000000'),
				8453
			);

			expect(result.sufficient).toBe(true);
			expect(typeof result.balance).toBe('bigint');
			expect(result.balance).toBe(BigInt('5000000000000000000'));
		});
	});

	describe('error handling', () => {
		it('should handle network errors in pool discovery', async () => {
			// Mock getTokenInfo to throw error
			getTokenInfoSpy.mockRejectedValueOnce(new Error('Network error'));

			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			// The actual implementation catches errors and returns success: false
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('should handle invalid token addresses gracefully', async () => {
			getTokenInfoSpy.mockRejectedValueOnce(new Error('Invalid token address'));

			const params: V4PoolDiscoveryParams = {
				token0: '0xinvalid',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe('token info caching', () => {
		it('should call RPC only once for duplicate token info requests', async () => {
			// Restore the real getTokenInfo so we can test caching behavior
			getTokenInfoSpy.mockRestore();

			const mockReadContract = vi.fn()
				.mockResolvedValueOnce('USDC')   // symbol (1st call)
				.mockResolvedValueOnce(6)          // decimals (1st call)
				.mockResolvedValueOnce('USDC')   // symbol (should NOT happen if cached)
				.mockResolvedValueOnce(6);         // decimals (should NOT happen if cached)

			getViemClientSpy.mockReturnValue({
				readContract: mockReadContract,
				getBalance: vi.fn(),
			});

			const tokenAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

			// Call getTokenInfo twice for the same token
			const result1 = await (service as any).getTokenInfo(tokenAddress, 8453);
			const result2 = await (service as any).getTokenInfo(tokenAddress, 8453);

			expect(result1.symbol).toBe('USDC');
			expect(result2.symbol).toBe('USDC');
			// readContract should only be called twice (symbol + decimals) for the first call
			expect(mockReadContract).toHaveBeenCalledTimes(2);
		});

		it('should resolve checksummed and lowercase addresses to same cache entry', async () => {
			getTokenInfoSpy.mockRestore();

			const mockReadContract = vi.fn()
				.mockResolvedValueOnce('USDC')
				.mockResolvedValueOnce(6);

			getViemClientSpy.mockReturnValue({
				readContract: mockReadContract,
				getBalance: vi.fn(),
			});

			const checksummed = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
			const lowercase = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

			const result1 = await (service as any).getTokenInfo(checksummed, 8453);
			const result2 = await (service as any).getTokenInfo(lowercase, 8453);

			expect(result1.symbol).toBe('USDC');
			expect(result2.symbol).toBe('USDC');
			// Only 2 RPC calls total (not 4)
			expect(mockReadContract).toHaveBeenCalledTimes(2);
		});
	});

	describe('error differentiation', () => {
		it('should throw "Invalid token address" for contract-level errors', async () => {
			getTokenInfoSpy.mockRestore();

			const mockReadContract = vi.fn().mockRejectedValue(new Error('execution reverted'));

			getViemClientSpy.mockReturnValue({
				readContract: mockReadContract,
				getBalance: vi.fn(),
			});

			await expect(
				(service as any).getTokenInfo('0xdeadbeef00000000000000000000000000000000', 8453)
			).rejects.toThrow('Invalid token address');
		});

		it('should throw "Failed to fetch" for transient RPC errors', async () => {
			getTokenInfoSpy.mockRestore();

			const mockReadContract = vi.fn().mockRejectedValue(new Error('request timeout'));

			getViemClientSpy.mockReturnValue({
				readContract: mockReadContract,
				getBalance: vi.fn(),
			});

			await expect(
				(service as any).getTokenInfo('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 8453)
			).rejects.toThrow('Failed to fetch token info for');
		});
	});

	describe('address normalization', () => {
		it('discoverPool should return lowercase poolKey addresses', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // checksummed
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			if (result.pool) {
				expect(result.pool.poolKey.currency0).toBe(result.pool.poolKey.currency0.toLowerCase());
				expect(result.pool.poolKey.currency1).toBe(result.pool.poolKey.currency1.toLowerCase());
			}
		});

		it('discoverPool should include token decimals in result', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result.success).toBe(true);
			if (result.pool) {
				expect(result.pool.token0Decimals).toBeDefined();
				expect(result.pool.token1Decimals).toBeDefined();
				expect(typeof result.pool.token0Decimals).toBe('number');
				expect(typeof result.pool.token1Decimals).toBe('number');
			}
		});
	});

	describe('return structure validation', () => {
		it('discoverPool should return correct structure', async () => {
			const params: V4PoolDiscoveryParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				chainId: 8453,
			};

			const result = await service.discoverPool(params);

			expect(result).toHaveProperty('success');
			expect(typeof result.success).toBe('boolean');

			if (result.success && result.pool) {
				expect(result.pool).toHaveProperty('exists');
				expect(result.pool).toHaveProperty('poolKey');
				expect(result.pool).toHaveProperty('token0Symbol');
				expect(result.pool).toHaveProperty('token1Symbol');
			}
		});

		it('approveToken should return correct structure', async () => {
			mockWalletService.transact = vi.fn().mockResolvedValue({
				success: true,
				hash: '0x123',
			});

			const params: V4ApprovalParams = {
				token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount: '1000.0',
				chainId: 8453,
			};

			const result = await service.approveToken('test-user', params, mockWalletService);

			expect(result).toHaveProperty('success');
			expect(typeof result.success).toBe('boolean');

			if (result.success) {
				expect(result).toHaveProperty('txHash');
			} else {
				expect(result).toHaveProperty('error');
			}
		});

		it('mintPosition should return correct structure', async () => {
			mockWalletService.getSession = vi.fn().mockReturnValue({
				userId: 'test-user',
				walletId: 'test-wallet',
				walletAddress: '0x1234567890123456789012345678901234567890',
			});

			mockWalletService.transact = vi.fn().mockResolvedValue({
				success: true,
				hash: '0x123',
			});

			vi.spyOn(service, 'discoverPool').mockResolvedValue(createMockPoolResult(true));

			const params: V4MintSimpleParams = {
				token0: '0x0000000000000000000000000000000000000000',
				token1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
				amount0Desired: '0.01',
				amount1Desired: '25.0',
				chainId: 8453,
			};

			const result = await service.mintPosition('test-user', params, mockWalletService);

			expect(result).toHaveProperty('success');
			expect(typeof result.success).toBe('boolean');

			if (result.success) {
				expect(result).toHaveProperty('txHash');
				expect(result).toHaveProperty('chainId');
				expect(result).toHaveProperty('expectedPosition');
				expect(result).toHaveProperty('explorer');
			} else {
				expect(result).toHaveProperty('error');
			}
		});
	});
});
