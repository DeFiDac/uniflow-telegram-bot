/**
 * UniswapV4Service - Fetch and value Uniswap V4 liquidity positions
 */

import { createPublicClient, http, PublicClient, formatUnits } from 'viem';
import { GraphQLClient } from 'graphql-request';
import { Position } from '@uniswap/v4-sdk';
import { Token } from '@uniswap/sdk-core';
import JSBI from 'jsbi';
import { V4PositionsResult, V4Position, TokenAmount } from './types';
import {
	V4_CHAIN_CONFIGS,
	POSITION_MANAGER_ABI,
	POOL_MANAGER_ABI,
	ERC20_ABI,
} from './v4-config';
import { PriceService } from './PriceService';

// GraphQL query to fetch positions for a wallet with pagination
// Based on Uniswap V4 subgraph schema
const GET_POSITIONS_QUERY = `
  query GetPositions($owner: String!, $first: Int!, $skip: Int!) {
    positions(first: $first, skip: $skip, where: { owner: $owner }) {
      id
      tokenId
      owner
    }
  }
`;

export class UniswapV4Service {
	private priceService: PriceService;
	private viemClients: Map<number, PublicClient>;

	constructor(priceService?: PriceService) {
		this.priceService = priceService || new PriceService();
		this.viemClients = new Map();
	}

	/**
	 * Public method: Fetch positions for wallet across all/specific chains
	 */
	async getPositions(
		walletAddress: string,
		chainId?: number
	): Promise<V4PositionsResult> {
		console.log(
			`[UniswapV4Service] Fetching positions for ${walletAddress}${chainId ? ` on chain ${chainId}` : ' on all chains'}`
		);

		const targetChains = chainId
			? [chainId]
			: Object.keys(V4_CHAIN_CONFIGS).map(Number);

		// Query all chains in parallel
		const chainResults = await Promise.allSettled(
			targetChains.map((id) =>
				this.getPositionsForChain(walletAddress, id)
			)
		);

		// Aggregate results
		const positions: V4Position[] = [];
		const chainErrors: { chainId: number; error: string }[] = [];

		chainResults.forEach((result, idx) => {
			const currentChainId = targetChains[idx];
			if (result.status === 'fulfilled') {
				positions.push(...result.value);
				console.log(
					`[UniswapV4Service] Chain ${currentChainId}: Found ${result.value.length} positions`
				);
			} else {
				const errorMsg =
					result.reason?.message || 'Unknown error';
				console.error(
					`[UniswapV4Service] Chain ${currentChainId} failed: ${errorMsg}`
				);
				chainErrors.push({ chainId: currentChainId, error: errorMsg });
			}
		});

		const totalValueUsd = positions.reduce(
			(sum, p) => sum + p.totalValueUsd,
			0
		);
		const totalFeesUsd = positions.reduce(
			(sum, p) => sum + p.feesUsd,
			0
		);

		console.log(
			`[UniswapV4Service] Total: ${positions.length} positions, $${totalValueUsd.toFixed(2)} value, $${totalFeesUsd.toFixed(2)} fees`
		);

		return {
			success: true,
			positions,
			totalValueUsd,
			totalFeesUsd,
			chainErrors: chainErrors.length > 0 ? chainErrors : undefined,
		};
	}

	/**
	 * Fetch positions for a specific chain
	 */
	private async getPositionsForChain(
		walletAddress: string,
		chainId: number
	): Promise<V4Position[]> {
		const config = V4_CHAIN_CONFIGS[chainId];
		if (!config) {
			throw new Error(`Unsupported chainId: ${chainId}`);
		}

		// 1. Query The Graph for token IDs with pagination
		const graphQLClient = new GraphQLClient(config.subgraphUrl);
		const positions: V4Position[] = [];
		const PAGE_SIZE = 100;

		try {
			// Fetch all positions using pagination
			const allPositions: Array<{ id: string; tokenId: string; owner: string }> = [];
			let skip = 0;
			let hasMorePages = true;

			while (hasMorePages) {
				const data = await graphQLClient.request<{
					positions: Array<{ id: string; tokenId: string; owner: string }>;
				}>(GET_POSITIONS_QUERY, {
					owner: walletAddress.toLowerCase(),
					first: PAGE_SIZE,
					skip: skip,
				});

				if (!data.positions || data.positions.length === 0) {
					// Empty page, stop pagination
					hasMorePages = false;
				} else {
					allPositions.push(...data.positions);
					console.log(
						`[UniswapV4Service] Fetched page at skip=${skip}: ${data.positions.length} positions`
					);

					// If we got fewer results than PAGE_SIZE, we've reached the end
					if (data.positions.length < PAGE_SIZE) {
						hasMorePages = false;
					} else {
						skip += PAGE_SIZE;
					}
				}
			}

			if (allPositions.length === 0) {
				console.log(
					`[UniswapV4Service] No positions found on chain ${chainId}`
				);
				return [];
			}

			console.log(
				`[UniswapV4Service] Found ${allPositions.length} token IDs total on chain ${chainId}`
			);

			// 2. Fetch position details for each token ID
			const viemClient = this.getViemClient(chainId);

			for (const pos of allPositions) {
				const tokenId = pos.tokenId || pos.id;
				try {
					const positionData = await this.fetchPositionData(
						tokenId,
						chainId,
						viemClient,
						config
					);
					positions.push(positionData);
				} catch (error) {
					console.error(
						`[UniswapV4Service] Failed to fetch position ${tokenId} on chain ${chainId}:`,
						error
					);
					// Continue with other positions
				}
			}
		} catch (error) {
			console.error(
				`[UniswapV4Service] GraphQL query failed for chain ${chainId}:`,
				error
			);
			throw error;
		}

		return positions;
	}

	/**
	 * Fetch position data from on-chain contracts with proper Uniswap V4 math
	 */
	private async fetchPositionData(
		tokenId: string,
		chainId: number,
		viemClient: PublicClient,
		config: typeof V4_CHAIN_CONFIGS[number]
	): Promise<V4Position> {
		// 1. Get pool and position info
		const positionInfo = (await viemClient.readContract({
			address: config.positionManagerAddress as `0x${string}`,
			abi: POSITION_MANAGER_ABI,
			functionName: 'getPoolAndPositionInfo',
			args: [BigInt(tokenId)],
		})) as [
			{
				currency0: string;
				currency1: string;
				fee: number;
				tickSpacing: number;
				hooks: string;
			},
			number,
			number,
			bigint
		];

		const [poolKey, tickLower, tickUpper, liquidity] = positionInfo;
		const { currency0, currency1, fee } = poolKey;

		// Type-safe poolKey for contract calls
		const poolKeyTyped = {
			currency0: currency0 as `0x${string}`,
			currency1: currency1 as `0x${string}`,
			fee,
			tickSpacing: poolKey.tickSpacing,
			hooks: poolKey.hooks as `0x${string}`,
		};

		// 2. Get pool state (sqrtPriceX96, current tick)
		const slot0 = (await viemClient.readContract({
			address: config.poolManagerAddress as `0x${string}`,
			abi: POOL_MANAGER_ABI,
			functionName: 'getSlot0',
			args: [poolKeyTyped],
		})) as [bigint, number, number, number];

		const [sqrtPriceX96, currentTick] = slot0;

		// 3. Fetch token metadata
		const [symbol0, decimals0, symbol1, decimals1] = await Promise.all([
			this.getTokenSymbol(currency0, viemClient),
			this.getTokenDecimals(currency0, viemClient),
			this.getTokenSymbol(currency1, viemClient),
			this.getTokenDecimals(currency1, viemClient),
		]);

		// 4. Calculate token amounts using Uniswap SDK Position class
		const token0 = new Token(chainId, currency0, decimals0, symbol0, symbol0);
		const token1 = new Token(chainId, currency1, decimals1, symbol1, symbol1);

		// Convert BigInt to JSBI for SDK compatibility
		const liquidityJSBI = JSBI.BigInt(liquidity.toString());
		const sqrtPriceX96JSBI = JSBI.BigInt(sqrtPriceX96.toString());

		const position = new Position({
			pool: {
				token0,
				token1,
				fee,
				sqrtRatioX96: sqrtPriceX96JSBI,
				liquidity: JSBI.BigInt(0),
				tick: currentTick,
			} as any,
			liquidity: liquidityJSBI,
			tickLower,
			tickUpper,
		});

		// Get token amounts from position and convert JSBI back to BigInt
		const amount0Raw = BigInt(position.amount0.quotient.toString());
		const amount1Raw = BigInt(position.amount1.quotient.toString());

		// 5. Get position info with fee growth data
		const posInfoWithFees = (await viemClient.readContract({
			address: config.positionManagerAddress as `0x${string}`,
			abi: POSITION_MANAGER_ABI,
			functionName: 'getPositionInfo',
			args: [BigInt(tokenId)],
		})) as [bigint, bigint, bigint];

		const [, feeGrowthInside0LastX128, feeGrowthInside1LastX128] = posInfoWithFees;

		// 6. Get current feeGrowthInside from pool
		const feeGrowthInside = (await viemClient.readContract({
			address: config.poolManagerAddress as `0x${string}`,
			abi: POOL_MANAGER_ABI,
			functionName: 'getFeeGrowthInside',
			args: [poolKeyTyped, tickLower, tickUpper],
		})) as [bigint, bigint];

		const [feeGrowthInside0X128, feeGrowthInside1X128] = feeGrowthInside;

		// 7. Calculate uncollected fees
		// Formula: (feeGrowthInsideCurrent - feeGrowthInsideLast) * liquidity / 2^128
		const Q128 = 2n ** 128n;
		const fees0Raw =
			((feeGrowthInside0X128 - feeGrowthInside0LastX128) * liquidity) / Q128;
		const fees1Raw =
			((feeGrowthInside1X128 - feeGrowthInside1LastX128) * liquidity) / Q128;

		// 8. Format token amounts (convert BigInt to human-readable)
		const amount0Formatted = parseFloat(formatUnits(amount0Raw, decimals0));
		const amount1Formatted = parseFloat(formatUnits(amount1Raw, decimals1));
		const fees0Formatted = parseFloat(formatUnits(fees0Raw, decimals0));
		const fees1Formatted = parseFloat(formatUnits(fees1Raw, decimals1));

		// 9. Fetch USD prices
		const prices = await this.priceService.getTokenPrices(
			[currency0, currency1],
			chainId
		);

		const price0 = prices.get(currency0.toLowerCase()) || 0;
		const price1 = prices.get(currency1.toLowerCase()) || 0;

		// 10. Calculate USD values
		const usdValue0 = amount0Formatted * price0;
		const usdValue1 = amount1Formatted * price1;
		const totalValueUsd = usdValue0 + usdValue1;

		const fees0Usd = fees0Formatted * price0;
		const fees1Usd = fees1Formatted * price1;
		const feesUsd = fees0Usd + fees1Usd;

		const token0Data: TokenAmount = {
			token: currency0,
			symbol: symbol0,
			amount: amount0Formatted.toFixed(6),
			decimals: decimals0,
			usdValue: usdValue0,
		};

		const token1Data: TokenAmount = {
			token: currency1,
			symbol: symbol1,
			amount: amount1Formatted.toFixed(6),
			decimals: decimals1,
			usdValue: usdValue1,
		};

		// Use poolKey representation instead of fake address
		const poolKeyStr = `${currency0.slice(0, 6)}...${currency0.slice(-4)}/${currency1.slice(0, 6)}...${currency1.slice(-4)}`;

		return {
			tokenId,
			chainId,
			chainName: config.name,
			poolAddress: poolKeyStr, // Pool key representation (not a real address)
			token0: token0Data,
			token1: token1Data,
			liquidity: liquidity.toString(),
			tickLower,
			tickUpper,
			feesUsd,
			totalValueUsd,
		};
	}

	/**
	 * Get token symbol from contract
	 */
	private async getTokenSymbol(
		tokenAddress: string,
		viemClient: PublicClient
	): Promise<string> {
		try {
			const symbol = await viemClient.readContract({
				address: tokenAddress as `0x${string}`,
				abi: ERC20_ABI,
				functionName: 'symbol',
			});
			return symbol as string;
		} catch (error) {
			console.warn(
				`[UniswapV4Service] Failed to fetch symbol for ${tokenAddress}`
			);
			return 'UNKNOWN';
		}
	}

	/**
	 * Get token decimals from contract
	 */
	private async getTokenDecimals(
		tokenAddress: string,
		viemClient: PublicClient
	): Promise<number> {
		try {
			const decimals = await viemClient.readContract({
				address: tokenAddress as `0x${string}`,
				abi: ERC20_ABI,
				functionName: 'decimals',
			});
			return decimals as number;
		} catch (error) {
			console.warn(
				`[UniswapV4Service] Failed to fetch decimals for ${tokenAddress}`
			);
			return 18; // Default to 18
		}
	}

	/**
	 * Get or create viem client for a chain
	 */
	private getViemClient(chainId: number): PublicClient {
		if (!this.viemClients.has(chainId)) {
			const config = V4_CHAIN_CONFIGS[chainId];
			const client = createPublicClient({
				transport: http(config.rpcUrl),
			});
			this.viemClients.set(chainId, client);
			console.log(`[UniswapV4Service] Created viem client for chain ${chainId}`);
		}
		return this.viemClients.get(chainId)!;
	}
}
