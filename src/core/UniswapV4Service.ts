/**
 * UniswapV4Service - Fetch and value Uniswap V4 liquidity positions
 */

import { createPublicClient, http, PublicClient, formatUnits } from 'viem';
import { GraphQLClient } from 'graphql-request';
import { V4PositionsResult, V4Position, TokenAmount } from './types';
import {
	V4_CHAIN_CONFIGS,
	POSITION_MANAGER_ABI,
	ERC20_ABI,
} from './v4-config';
import { PriceService } from './PriceService';

// GraphQL query to fetch positions for a wallet
// Based on Uniswap V4 subgraph schema
const GET_POSITIONS_QUERY = `
  query GetPositions($owner: String!) {
    positions(where: { owner: $owner }) {
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

		// 1. Query The Graph for token IDs
		const graphQLClient = new GraphQLClient(config.subgraphUrl);
		const positions: V4Position[] = [];

		try {
			const data = await graphQLClient.request<{
				positions: Array<{ id: string; tokenId: string; owner: string }>;
			}>(GET_POSITIONS_QUERY, {
				owner: walletAddress.toLowerCase(),
			});

			if (!data.positions || data.positions.length === 0) {
				console.log(
					`[UniswapV4Service] No positions found on chain ${chainId}`
				);
				return [];
			}

			console.log(
				`[UniswapV4Service] Found ${data.positions.length} token IDs on chain ${chainId}`
			);

			// 2. Fetch position details for each token ID
			const viemClient = this.getViemClient(chainId);

			for (const pos of data.positions) {
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
	 * Fetch position data from on-chain contracts
	 */
	private async fetchPositionData(
		tokenId: string,
		chainId: number,
		viemClient: PublicClient,
		config: typeof V4_CHAIN_CONFIGS[number]
	): Promise<V4Position> {
		// Call getPoolAndPositionInfo
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
		const { currency0, currency1 } = poolKey;

		// Fetch token metadata
		const [symbol0, decimals0, symbol1, decimals1] = await Promise.all([
			this.getTokenSymbol(currency0, viemClient),
			this.getTokenDecimals(currency0, viemClient),
			this.getTokenSymbol(currency1, viemClient),
			this.getTokenDecimals(currency1, viemClient),
		]);

		// Calculate token amounts (simplified: 50/50 split of liquidity)
		// TODO: Improve with proper tick math using @uniswap/v4-sdk
		const liquidityNum = Number(liquidity);
		const amount0 = (liquidityNum / 2).toString();
		const amount1 = (liquidityNum / 2).toString();

		// Fetch USD prices
		const prices = await this.priceService.getTokenPrices(
			[currency0, currency1],
			chainId
		);

		const price0 = prices.get(currency0.toLowerCase()) || 0;
		const price1 = prices.get(currency1.toLowerCase()) || 0;

		// Calculate USD values
		const amount0Formatted = parseFloat(
			formatUnits(BigInt(Math.floor(parseFloat(amount0))), decimals0)
		);
		const amount1Formatted = parseFloat(
			formatUnits(BigInt(Math.floor(parseFloat(amount1))), decimals1)
		);

		const usdValue0 = amount0Formatted * price0;
		const usdValue1 = amount1Formatted * price1;
		const totalValueUsd = usdValue0 + usdValue1;

		// Estimate fees (simplified: 1% of position value)
		// TODO: Implement accurate fee calculation using feeGrowth
		const feesUsd = totalValueUsd * 0.01;

		const token0: TokenAmount = {
			token: currency0,
			symbol: symbol0,
			amount: amount0Formatted.toFixed(6),
			decimals: decimals0,
			usdValue: usdValue0,
		};

		const token1: TokenAmount = {
			token: currency1,
			symbol: symbol1,
			amount: amount1Formatted.toFixed(6),
			decimals: decimals1,
			usdValue: usdValue1,
		};

		return {
			tokenId,
			chainId,
			chainName: config.name,
			poolAddress: `${currency0}-${currency1}`,
			token0,
			token1,
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
