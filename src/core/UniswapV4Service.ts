/**
 * UniswapV4Service - Fetch Uniswap V4 liquidity positions
 * Following official SDK guide: https://docs.uniswap.org/sdk/v4/guides/liquidity/position-fetching
 */

import { createPublicClient, http, PublicClient } from 'viem';
import { GraphQLClient } from 'graphql-request';
import { V4PositionsResult, V4Position } from './types';
import { V4_CHAIN_CONFIGS, POSITION_MANAGER_ABI } from './v4-config';

// GraphQL query to get positions by owner (official SDK guide)
const GET_POSITIONS_QUERY = `
query GetPositions($owner: String!) {
  positions(where: { owner: $owner }) {
    tokenId
    owner
    id
  }
}
`;

export class UniswapV4Service {
	private viemClients: Map<number, PublicClient>;

	constructor() {
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

		console.log(
			`[UniswapV4Service] Total: ${positions.length} positions found`
		);

		return {
			success: true,
			positions,
			chainErrors: chainErrors.length > 0 ? chainErrors : undefined,
		};
	}

	/**
	 * Fetch positions for a specific chain
	 * Uses ERC721 enumeration instead of subgraph (V4 subgraph doesn't index positions)
	 */
	private async getPositionsForChain(
		walletAddress: string,
		chainId: number
	): Promise<V4Position[]> {
		const config = V4_CHAIN_CONFIGS[chainId];
		if (!config) {
			throw new Error(`Unsupported chainId: ${chainId}`);
		}

		const positions: V4Position[] = [];
		const viemClient = this.getViemClient(chainId);

		try {
			// 1. Query subgraph for owned positions (Official SDK Guide Step 1)
			console.log(
				`[UniswapV4Service] Querying subgraph for positions of ${walletAddress} on chain ${chainId}`
			);
			console.log(`[UniswapV4Service] Subgraph URL: ${config.subgraphUrl}`);
			console.log(`[UniswapV4Service] Query variables:`, { owner: walletAddress.toLowerCase() });

			const graphQLClient = new GraphQLClient(config.subgraphUrl);
			const data = await graphQLClient.request<{
				positions: Array<{ tokenId: string }>;
			}>(GET_POSITIONS_QUERY, {
				owner: walletAddress.toLowerCase(),
			});

			console.log(`[UniswapV4Service] GraphQL response:`, JSON.stringify(data, null, 2));

			const tokenIds = data.positions.map((p) => p.tokenId);

			console.log(
				`[UniswapV4Service] Found ${tokenIds.length} positions on chain ${chainId}`
			);

			if (tokenIds.length === 0) {
				return [];
			}

			// 2. Fetch position details for each token ID
			for (const tokenId of tokenIds) {
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
				`[UniswapV4Service] Failed to query positions for chain ${chainId}:`,
				error
			);
			throw error;
		}

		return positions;
	}

	/**
	 * Fetch position data from on-chain contracts (Official SDK Guide Steps 2 & 3)
	 */
	private async fetchPositionData(
		tokenId: string,
		chainId: number,
		viemClient: PublicClient,
		config: typeof V4_CHAIN_CONFIGS[number]
	): Promise<V4Position> {
		// Step 2: Get pool and packed position info
		const [poolKey, packedPositionInfo] = (await viemClient.readContract({
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
			bigint
		];

		// Step 2: Decode packed position info (uint256)
		// Bit layout: poolId (200 bits) | tickUpper (24 bits) | tickLower (24 bits) | hasSubscriber (8 bits)
		const packed = BigInt(packedPositionInfo);

		// Extract tickLower: bits 8-31 (shift right 8, sign extend 24 bits)
		const tickLowerRaw = (packed >> 8n) & 0xFFFFFFn;
		const tickLower =
			tickLowerRaw >= 0x800000n
				? Number(tickLowerRaw - 0x1000000n)
				: Number(tickLowerRaw);

		// Extract tickUpper: bits 32-55 (shift right 32, sign extend 24 bits)
		const tickUpperRaw = (packed >> 32n) & 0xFFFFFFn;
		const tickUpper =
			tickUpperRaw >= 0x800000n
				? Number(tickUpperRaw - 0x1000000n)
				: Number(tickUpperRaw);

		// Step 3: Get position liquidity
		const liquidity = (await viemClient.readContract({
			address: config.positionManagerAddress as `0x${string}`,
			abi: POSITION_MANAGER_ABI,
			functionName: 'getPositionLiquidity',
			args: [BigInt(tokenId)],
		})) as bigint;

		return {
			tokenId,
			chainId,
			chainName: config.name,
			poolKey: {
				currency0: poolKey.currency0,
				currency1: poolKey.currency1,
				fee: Number(poolKey.fee),
				tickSpacing: Number(poolKey.tickSpacing),
				hooks: poolKey.hooks,
			},
			tickLower,
			tickUpper,
			liquidity: liquidity.toString(),
		};
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
