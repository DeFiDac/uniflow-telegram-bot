/**
 * Uniswap V4 Position Minting Service
 * Handles pool discovery, token approvals, and position minting
 */

import { createPublicClient, http, PublicClient, parseUnits, formatUnits, encodeFunctionData, encodeAbiParameters, keccak256 } from 'viem';
import { mainnet, bsc, base, arbitrum } from 'viem/chains';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { Token, CurrencyAmount, Percent } from '@uniswap/sdk-core';
import { nearestUsableTick } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import {
	V4PoolDiscoveryParams,
	V4PoolDiscoveryResult,
	V4ApprovalParams,
	V4ApprovalResult,
	V4MintSimpleParams,
	V4MintResult,
	ErrorCodes,
} from './types';
import { V4_CHAIN_CONFIGS, STATE_VIEW_ABI, ERC20_ABI } from './v4-config';
import { WalletService } from './WalletService';

// Unichain chain config (not in viem yet)
const unichain = {
	id: 130,
	name: 'Unichain',
	nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
	rpcUrls: {
		default: { http: ['https://rpc.unichain.org'] },
	},
} as const;

const CHAIN_CONFIGS: Record<number, any> = {
	1: mainnet,
	56: bsc,
	8453: base,
	42161: arbitrum,
	130: unichain,
};

// Native ETH address representation
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

// Max uint256 for unlimited approvals
const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// Fee tiers to try (in order)
const FEE_TIERS = [
	{ fee: 500, tickSpacing: 10 },
	{ fee: 3000, tickSpacing: 60 },
	{ fee: 10000, tickSpacing: 200 },
];

/**
 * Derive default tickSpacing from fee tier
 * Based on standard Uniswap V4 fee tier mapping
 */
function getDefaultTickSpacing(fee: number): number {
	const feeToTickSpacing: Record<number, number> = {
		100: 1,
		500: 10,
		3000: 60,
		10000: 200,
	};
	return feeToTickSpacing[fee] || 60; // Default to 60 if unknown fee
}

interface TokenInfo {
	address: string;
	symbol: string;
	decimals: number;
}

interface PoolState {
	poolId: string;
	sqrtPriceX96: bigint;
	tick: number;
	liquidity: bigint;
}

export class UniswapV4MintService {
	private viemClients: Map<number, any>;
	private tokenInfoCache: Map<string, TokenInfo> = new Map();

	constructor() {
		this.viemClients = new Map();
	}

	/**
	 * Get or create viem client for chain
	 */
	private getViemClient(chainId: number): any {
		if (!this.viemClients.has(chainId)) {
			const config = V4_CHAIN_CONFIGS[chainId];
			if (!config) {
				throw new Error(`Unsupported chain ID: ${chainId}`);
			}

			const chainConfig = CHAIN_CONFIGS[chainId];
			const client = createPublicClient({
				chain: chainConfig,
				transport: http(config.rpcUrl),
			});

			this.viemClients.set(chainId, client);
		}

		return this.viemClients.get(chainId)!;
	}

	/**
	 * Get token information (symbol, decimals) with caching and proper error handling
	 */
	private async getTokenInfo(tokenAddress: string, chainId: number): Promise<TokenInfo> {
		const normalizedAddress = tokenAddress.toLowerCase();

		// Handle native ETH
		if (normalizedAddress === NATIVE_ETH_ADDRESS) {
			return {
				address: NATIVE_ETH_ADDRESS,
				symbol: 'ETH',
				decimals: 18,
			};
		}

		// Check cache
		const cacheKey = `${chainId}:${normalizedAddress}`;
		const cached = this.tokenInfoCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		const client = this.getViemClient(chainId);

		try {
			const [symbol, decimals] = await Promise.all([
				client.readContract({
					address: normalizedAddress as `0x${string}`,
					abi: ERC20_ABI,
					functionName: 'symbol',
				}),
				client.readContract({
					address: normalizedAddress as `0x${string}`,
					abi: ERC20_ABI,
					functionName: 'decimals',
				}),
			]);

			const tokenInfo: TokenInfo = {
				address: normalizedAddress,
				symbol: symbol as string,
				decimals: decimals as number,
			};

			// Cache immutable token metadata
			this.tokenInfoCache.set(cacheKey, tokenInfo);

			return tokenInfo;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			// Differentiate contract-level errors from transient RPC failures
			const isContractError =
				message.includes('reverted') ||
				message.includes('execution reverted') ||
				message.includes('invalid opcode') ||
				message.includes('not a contract');
			if (isContractError) {
				throw new Error(`Invalid token address: ${normalizedAddress}`);
			}
			throw new Error(`Failed to fetch token info for ${normalizedAddress}: ${message}`);
		}
	}

	/**
	 * Fetch pool state from StateView contract
	 */
	private async fetchPoolState(
		poolKey: {
			currency0: string;
			currency1: string;
			fee: number;
			tickSpacing: number;
			hooks: string;
		},
		chainId: number
	): Promise<PoolState | null> {
		const config = V4_CHAIN_CONFIGS[chainId];
		const client = this.getViemClient(chainId);

		try {
			// Compute poolId = keccak256(abi.encode(poolKey))
			const poolId = keccak256(
				encodeAbiParameters(
					[
						{ name: 'currency0', type: 'address' },
						{ name: 'currency1', type: 'address' },
						{ name: 'fee', type: 'uint24' },
						{ name: 'tickSpacing', type: 'int24' },
						{ name: 'hooks', type: 'address' },
					],
					[
						poolKey.currency0 as `0x${string}`,
						poolKey.currency1 as `0x${string}`,
						poolKey.fee,
						poolKey.tickSpacing,
						poolKey.hooks as `0x${string}`,
					]
				)
			);

			// Query slot0 and liquidity from StateView using poolId
			const [slot0Result, liquidity] = await Promise.all([
				client.readContract({
					address: config.stateViewAddress as `0x${string}`,
					abi: STATE_VIEW_ABI,
					functionName: 'getSlot0',
					args: [poolId],
				}),
				client.readContract({
					address: config.stateViewAddress as `0x${string}`,
					abi: STATE_VIEW_ABI,
					functionName: 'getLiquidity',
					args: [poolId],
				}),
			]);

			const [sqrtPriceX96, tick] = slot0Result as readonly [bigint, number, number, number];

			// If sqrtPriceX96 is 0, pool doesn't exist
			if (sqrtPriceX96 === 0n) {
				return null;
			}

			return {
				poolId,
				sqrtPriceX96,
				tick,
				liquidity: liquidity as bigint,
			};
		} catch (error) {
			console.error('Failed to fetch pool state:', error);
			return null;
		}
	}

	/**
	 * Discover pool for token pair (tries multiple fee tiers)
	 */
	async discoverPool(params: V4PoolDiscoveryParams): Promise<V4PoolDiscoveryResult> {
		const { token0, token1, chainId, fee: requestedFee, tickSpacing: requestedTickSpacing } = params;

		try {
			// Validate chain
			if (!V4_CHAIN_CONFIGS[chainId]) {
				return {
					success: false,
					error: `Unsupported chain ID: ${chainId}`,
				};
			}

			// Normalize and sort token addresses (Uniswap convention: token0 < token1)
			const t0 = token0.toLowerCase();
			const t1 = token1.toLowerCase();

			// Guard against identical token addresses after normalization
			if (t0 === t1) {
				return {
					success: false,
					error: 'token0 and token1 must be different addresses',
				};
			}

			const [currency0, currency1] = t0 < t1 ? [t0, t1] : [t1, t0];

			// Get token info
			const [token0Info, token1Info] = await Promise.all([
				this.getTokenInfo(currency0, chainId),
				this.getTokenInfo(currency1, chainId),
			]);

			// Determine which fee tiers to try
			let feeTiersToTry: Array<{ fee: number; tickSpacing: number }>;

			if (requestedFee !== undefined) {
				// User specified a fee - query ONLY that fee tier
				const tickSpacing =
					requestedTickSpacing !== undefined ? requestedTickSpacing : getDefaultTickSpacing(requestedFee);

				feeTiersToTry = [{ fee: requestedFee, tickSpacing }];
			} else if (requestedTickSpacing !== undefined) {
				// tickSpacing without fee - error (ambiguous)
				return {
					success: false,
					error: 'tickSpacing cannot be specified without fee. Please provide both or neither.',
				};
			} else {
				// No fee specified - try all fee tiers (backward compatible)
				feeTiersToTry = FEE_TIERS;
			}

			// Try each fee tier
			for (const { fee, tickSpacing } of feeTiersToTry) {
				const poolKey = {
					currency0,
					currency1,
					fee,
					tickSpacing,
					hooks: NATIVE_ETH_ADDRESS, // No hooks
				};

				const poolState = await this.fetchPoolState(poolKey, chainId);

				if (poolState && poolState.sqrtPriceX96 > 0n) {
					return {
						success: true,
						pool: {
							exists: true,
							poolId: poolState.poolId,
							poolKey,
							currentTick: poolState.tick,
							sqrtPriceX96: poolState.sqrtPriceX96.toString(),
							liquidity: poolState.liquidity.toString(),
							token0Symbol: token0Info.symbol,
							token1Symbol: token1Info.symbol,
							token0Decimals: token0Info.decimals,
							token1Decimals: token1Info.decimals,
						},
					};
				}
			}

			// No pool found with any fee tier
			// Use requested fee/tickSpacing for defaults if provided, otherwise use 3000/60
			const defaultFee = requestedFee !== undefined ? requestedFee : 3000;
			const defaultTickSpacing =
				requestedTickSpacing !== undefined
					? requestedTickSpacing
					: requestedFee !== undefined
						? getDefaultTickSpacing(requestedFee)
						: 60;

			return {
				success: true,
				pool: {
					exists: false,
					poolKey: {
						currency0,
						currency1,
						fee: defaultFee,
						tickSpacing: defaultTickSpacing,
						hooks: NATIVE_ETH_ADDRESS,
					},
					currentTick: 0,
					sqrtPriceX96: '0',
					liquidity: '0',
					token0Symbol: token0Info.symbol,
					token1Symbol: token1Info.symbol,
					token0Decimals: token0Info.decimals,
					token1Decimals: token1Info.decimals,
				},
			};
		} catch (error) {
			console.error('Pool discovery error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Check user's token balance
	 */
	private async checkBalance(
		walletAddress: string,
		token: string,
		amount: bigint,
		chainId: number
	): Promise<{ sufficient: boolean; balance: bigint; required: bigint }> {
		const client = this.getViemClient(chainId);

		try {
			let balance: bigint;

			if (token === NATIVE_ETH_ADDRESS) {
				// Native ETH balance
				balance = BigInt(await client.getBalance({
					address: walletAddress as `0x${string}`,
				}));
			} else {
				// ERC20 balance
				balance = BigInt(await client.readContract({
					address: token as `0x${string}`,
					abi: ERC20_ABI,
					functionName: 'balanceOf',
					args: [walletAddress as `0x${string}`],
				}));
			}

			return {
				sufficient: balance >= amount,
				balance,
				required: amount,
			};
		} catch (error) {
			console.error('Balance check error:', error);
			throw new Error(`Failed to check balance for ${token}`);
		}
	}

	/**
	 * Check token allowance for spender
	 */
	private async checkAllowance(
		walletAddress: string,
		token: string,
		spender: string,
		chainId: number
	): Promise<bigint> {
		// Native ETH doesn't need approval
		if (token === NATIVE_ETH_ADDRESS) {
			return BigInt(MAX_UINT256);
		}

		const client = this.getViemClient(chainId);

		try {
			const allowance = (await client.readContract({
				address: token as `0x${string}`,
				abi: ERC20_ABI,
				functionName: 'allowance',
				args: [walletAddress as `0x${string}`, spender as `0x${string}`],
			})) as bigint;

			return allowance;
		} catch (error) {
			console.error('Allowance check error:', error);
			throw new Error(`Failed to check allowance for ${token}`);
		}
	}

	/**
	 * Generate approval transaction
	 */
	async approveToken(
		userId: string,
		params: V4ApprovalParams,
		walletService: WalletService
	): Promise<V4ApprovalResult> {
		const { token, amount, chainId } = params;

		try {
			// Validate chain
			const config = V4_CHAIN_CONFIGS[chainId];
			if (!config) {
				return {
					success: false,
					error: `Unsupported chain ID: ${chainId}`,
				};
			}

			// Native ETH doesn't need approval
			if (token === NATIVE_ETH_ADDRESS) {
				return {
					success: false,
					error: 'Native ETH does not require approval',
				};
			}

			// Get token info
			const tokenInfo = await this.getTokenInfo(token, chainId);

			// Parse amount (use max uint256 for unlimited approval)
			const amountWei = amount === 'unlimited' ? BigInt(MAX_UINT256) : parseUnits(amount, tokenInfo.decimals);

			// Generate approval calldata
			const data = encodeFunctionData({
				abi: ERC20_ABI,
				functionName: 'approve',
				args: [config.positionManagerAddress as `0x${string}`, amountWei],
			});

			// Execute transaction via WalletService
			const result = await walletService.transact(userId, {
				to: token,
				value: '0',
				data,
				chainId,
			});

			if (result.success && result.hash) {
				return {
					success: true,
					txHash: result.hash,
				};
			} else {
				return {
					success: false,
					error: result.error || 'Approval transaction failed',
				};
			}
		} catch (error) {
			console.error('Approval error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Calculate full-range ticks
	 */
	private calculateFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
		const MIN_TICK = -887272;
		const MAX_TICK = 887272;

		return {
			tickLower: nearestUsableTick(MIN_TICK, tickSpacing),
			tickUpper: nearestUsableTick(MAX_TICK, tickSpacing),
		};
	}

	/**
	 * Get block explorer URL
	 */
	private getExplorerUrl(txHash: string, chainId: number): string {
		const explorers: Record<number, string> = {
			1: 'https://etherscan.io',
			56: 'https://bscscan.com',
			8453: 'https://basescan.org',
			42161: 'https://arbiscan.io',
			130: 'https://unichain.org/explorer',
		};

		const baseUrl = explorers[chainId] || 'https://etherscan.io';
		return `${baseUrl}/tx/${txHash}`;
	}

	/**
	 * Mint position (Simple Mode)
	 */
	async mintPosition(
		userId: string,
		params: V4MintSimpleParams,
		walletService: WalletService
	): Promise<V4MintResult> {
		const { token0, token1, amount0Desired, amount1Desired, chainId, slippageTolerance = 0.5, deadline } = params;

		try {
			// Validate chain
			const config = V4_CHAIN_CONFIGS[chainId];
			if (!config) {
				return {
					success: false,
					error: `Unsupported chain ID: ${chainId}`,
				};
			}

			// Get session
			const session = walletService.getSession(userId);
			if (!session) {
				return {
					success: false,
					error: ErrorCodes.SESSION_NOT_FOUND,
				};
			}

			// Step 1: Discover pool (normalize addresses)
			const poolDiscovery = await this.discoverPool({
				token0: token0.toLowerCase(),
				token1: token1.toLowerCase(),
				chainId,
			});
			if (!poolDiscovery.success || !poolDiscovery.pool || !poolDiscovery.pool.exists) {
				return {
					success: false,
					error: 'No pool found for this token pair. Try different tokens or fee tiers.',
				};
			}

			const pool = poolDiscovery.pool;

			// Detect if tokens were swapped during pool discovery
			// discoverPool sorts tokens (currency0 < currency1), so we need to map amounts accordingly
			const tokensSwapped = token0.toLowerCase() !== pool.poolKey.currency0.toLowerCase();

			// Map amounts to match pool's sorted currency order
			const amount0DesiredForPool = tokensSwapped ? amount1Desired : amount0Desired;
			const amount1DesiredForPool = tokensSwapped ? amount0Desired : amount1Desired;

			// Step 2: Use token info from pool discovery (avoids redundant RPC calls)
			const token0Info = { symbol: pool.token0Symbol, decimals: pool.token0Decimals };
			const token1Info = { symbol: pool.token1Symbol, decimals: pool.token1Decimals };

			// Amounts are already in smallest token units (wei for ETH, raw units for ERC20)
			const amount0Wei = BigInt(amount0DesiredForPool);
			const amount1Wei = BigInt(amount1DesiredForPool);

			// Step 3: Check balances
			const [balance0Check, balance1Check] = await Promise.all([
				this.checkBalance(session.walletAddress, pool.poolKey.currency0, amount0Wei, chainId),
				this.checkBalance(session.walletAddress, pool.poolKey.currency1, amount1Wei, chainId),
			]);

			if (!balance0Check.sufficient) {
				return {
					success: false,
					error: `Insufficient ${token0Info.symbol} balance. Required: ${formatUnits(
						balance0Check.required,
						token0Info.decimals
					)}, Available: ${formatUnits(balance0Check.balance, token0Info.decimals)}`,
				};
			}

			if (!balance1Check.sufficient) {
				return {
					success: false,
					error: `Insufficient ${token1Info.symbol} balance. Required: ${formatUnits(
						balance1Check.required,
						token1Info.decimals
					)}, Available: ${formatUnits(balance1Check.balance, token1Info.decimals)}`,
				};
			}

			// Step 4: Check allowances (skip native ETH)
			const positionManager = config.positionManagerAddress;

			if (pool.poolKey.currency0 !== NATIVE_ETH_ADDRESS) {
				const allowance0 = await this.checkAllowance(
					session.walletAddress,
					pool.poolKey.currency0,
					positionManager,
					chainId
				);
				if (allowance0 < amount0Wei) {
					return {
						success: false,
						error: `${token0Info.symbol} not approved. Call /api/v4/approve first with token=${pool.poolKey.currency0}`,
					};
				}
			}

			if (pool.poolKey.currency1 !== NATIVE_ETH_ADDRESS) {
				const allowance1 = await this.checkAllowance(
					session.walletAddress,
					pool.poolKey.currency1,
					positionManager,
					chainId
				);
				if (allowance1 < amount1Wei) {
					return {
						success: false,
						error: `${token1Info.symbol} not approved. Call /api/v4/approve first with token=${pool.poolKey.currency1}`,
					};
				}
			}

			// Step 5: Calculate full-range ticks
			const { tickLower, tickUpper } = this.calculateFullRangeTicks(pool.poolKey.tickSpacing);

			// Step 6: Create SDK objects
			const token0Sdk = new Token(chainId, pool.poolKey.currency0, token0Info.decimals, token0Info.symbol);
			const token1Sdk = new Token(chainId, pool.poolKey.currency1, token1Info.decimals, token1Info.symbol);

			const poolSdk = new Pool(
				token0Sdk,
				token1Sdk,
				pool.poolKey.fee,
				pool.poolKey.tickSpacing,
				pool.poolKey.hooks,
				JSBI.BigInt(pool.sqrtPriceX96),
				JSBI.BigInt(pool.liquidity),
				pool.currentTick
			);

			const positionSdk = Position.fromAmounts({
				pool: poolSdk,
				tickLower,
				tickUpper,
				amount0: JSBI.BigInt(amount0Wei.toString()),
				amount1: JSBI.BigInt(amount1Wei.toString()),
				useFullPrecision: true,
			});

			// Step 7: Generate mint calldata using SDK
			const deadlineTimestamp = deadline || Math.floor(Date.now() / 1000) + 1200; // 20 minutes
			const slippagePercent = new Percent(Math.floor(slippageTolerance * 100), 10000);

			const { calldata, value } = V4PositionManager.addCallParameters(positionSdk, {
				recipient: session.walletAddress as `0x${string}`,
				deadline: deadlineTimestamp.toString(),
				slippageTolerance: slippagePercent,
			});

			// Step 8: Execute transaction
			const result = await walletService.transact(userId, {
				to: positionManager,
				value: value.toString(),
				data: calldata,
				chainId,
			});

			if (result.success && result.hash) {
				return {
					success: true,
					txHash: result.hash,
					chainId,
					expectedPosition: {
						poolKey: pool.poolKey,
						tickLower,
						tickUpper,
						liquidity: positionSdk.liquidity.toString(),
						// Use amounts aligned with pool's currency order
						amount0: amount0DesiredForPool,
						amount1: amount1DesiredForPool,
					},
					explorer: this.getExplorerUrl(result.hash, chainId),
				};
			} else {
				return {
					success: false,
					error: result.error || 'Minting transaction failed',
				};
			}
		} catch (error) {
			console.error('Mint position error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error during minting',
			};
		}
	}
}
