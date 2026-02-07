/**
 * Uniswap V4 chain configurations and constants
 */

import { UniswapV4ChainConfig } from './types';

// Public RPC fallbacks
const PUBLIC_RPCS: Record<number, string> = {
	1: 'https://eth.llamarpc.com',
	56: 'https://bsc-dataseed.binance.org',
	8453: 'https://mainnet.base.org',
	42161: 'https://arb1.arbitrum.io/rpc',
	130: 'https://rpc.unichain.org',
};

/**
 * Get Infura RPC URLs from environment variables
 * Constructs full URLs by combining base URL + API key
 */
const INFURA_API_KEY = process.env.INFURA_API_KEY || '';
const INFURA_BASE_URLS: Record<number, string> = {
	1: process.env.INFURA_ETHEREUM_RPC_URL || '',
	56: process.env.INFURA_BSC_RPC_URL || '',
	8453: process.env.INFURA_BASE_RPC_URL || '',
	42161: process.env.INFURA_ARBITRUM_RPC_URL || '',
	130: process.env.INFURA_UNICHAIN_RPC_URL || '',
};

const INFURA_RPCS: Record<number, string> = Object.fromEntries(
	Object.entries(INFURA_BASE_URLS).map(([chainId, baseUrl]) => [
		chainId,
		baseUrl && INFURA_API_KEY ? `${baseUrl}${INFURA_API_KEY}` : '',
	])
);

// The Graph subgraph IDs for Uniswap V4
// Source: https://thegraph.com/explorer
const SUBGRAPH_IDS: Record<number, string> = {
	1: 'DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G', // Ethereum
	56: '2qQpC8inZPZL4tYfRQPFGZhsE8mYzE67n5z3Yf5uuKMu', // BSC
	8453: 'Gqm2b5J85n1bhCyDMpGbtbVn4935EvvdyHdHrx3dibyj', // Base
	42161: 'G5TsTKNi8yhPSV7kycaE23oWbqv9zzNqR49FoEQjzq1r', // Arbitrum One
	130: 'EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH', // Unichain Mainnet
};

/**
 * Build The Graph subgraph URL with API key
 */
function buildSubgraphUrl(chainId: number): string {
	const apiKey = process.env.THE_GRAPH_API_KEY || '';
	const subgraphId = SUBGRAPH_IDS[chainId];

	if (!subgraphId || subgraphId.startsWith('VERIFY_')) {
		console.warn(
			`⚠️  Subgraph ID for chainId ${chainId} needs verification`
		);
	}

	return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}

/**
 * Uniswap V4 chain configurations
 * Addresses source: https://docs.uniswap.org/contracts/v4/deployments
 */
export const V4_CHAIN_CONFIGS: Record<number, UniswapV4ChainConfig> = {
	1: {
		chainId: 1,
		name: 'Ethereum',
		positionManagerAddress: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		subgraphUrl: buildSubgraphUrl(1),
		rpcUrl: INFURA_RPCS[1] || PUBLIC_RPCS[1],
	},
	56: {
		chainId: 56,
		name: 'BSC',
		positionManagerAddress: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
		poolManagerAddress: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
		subgraphUrl: buildSubgraphUrl(56),
		rpcUrl: INFURA_RPCS[56] || PUBLIC_RPCS[56],
	},
	8453: {
		chainId: 8453,
		name: 'Base',
		positionManagerAddress: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		subgraphUrl: buildSubgraphUrl(8453),
		rpcUrl: INFURA_RPCS[8453] || PUBLIC_RPCS[8453],
	},
	42161: {
		chainId: 42161,
		name: 'Arbitrum One',
		positionManagerAddress: '0xd88f38f930b7952f2db2432cb002e7abbf3dd869',
		poolManagerAddress: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
		subgraphUrl: buildSubgraphUrl(42161),
		rpcUrl: INFURA_RPCS[42161] || PUBLIC_RPCS[42161],
	},
	130: {
		chainId: 130,
		name: 'Unichain',
		positionManagerAddress: '0xf969aee60879c54baaed9f3ed26147db216fd664',
		poolManagerAddress: '0x00b036b58a818b1bc34d502d3fe730db729e62ac',
		subgraphUrl: buildSubgraphUrl(130),
		rpcUrl: INFURA_RPCS[130] || PUBLIC_RPCS[130],
	},
};

export const SUPPORTED_CHAIN_IDS = [1, 56, 8453, 42161, 130];

/**
 * Minimal ABIs for contract calls
 */

// Position Manager ABI - for fetching position details
export const POSITION_MANAGER_ABI = [
	{
		name: 'getPoolAndPositionInfo',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'tokenId', type: 'uint256' }],
		outputs: [
			{
				name: 'poolKey',
				type: 'tuple',
				components: [
					{ name: 'currency0', type: 'address' },
					{ name: 'currency1', type: 'address' },
					{ name: 'fee', type: 'uint24' },
					{ name: 'tickSpacing', type: 'int24' },
					{ name: 'hooks', type: 'address' },
				],
			},
			{ name: 'positionInfo', type: 'uint256' }, // Packed: poolId (200 bits) | tickUpper (24 bits) | tickLower (24 bits) | hasSubscriber (8 bits)
		],
	},
	{
		name: 'getPositionLiquidity',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'tokenId', type: 'uint256' }],
		outputs: [{ name: 'liquidity', type: 'uint128' }],
	},
	// ERC721 functions for querying owned tokens
	{
		name: 'balanceOf',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'owner', type: 'address' }],
		outputs: [{ name: 'balance', type: 'uint256' }],
	},
	{
		name: 'tokenURI',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'tokenId', type: 'uint256' }],
		outputs: [{ name: 'uri', type: 'string' }],
	},
] as const;

// Pool Manager ABI - for fetching pool state
export const POOL_MANAGER_ABI = [
	{
		name: 'getSlot0',
		type: 'function',
		stateMutability: 'view',
		inputs: [
			{
				name: 'poolKey',
				type: 'tuple',
				components: [
					{ name: 'currency0', type: 'address' },
					{ name: 'currency1', type: 'address' },
					{ name: 'fee', type: 'uint24' },
					{ name: 'tickSpacing', type: 'int24' },
					{ name: 'hooks', type: 'address' },
				],
			},
		],
		outputs: [
			{ name: 'sqrtPriceX96', type: 'uint160' },
			{ name: 'tick', type: 'int24' },
			{ name: 'protocolFee', type: 'uint24' },
			{ name: 'lpFee', type: 'uint24' },
		],
	},
	{
		name: 'getFeeGrowthInside',
		type: 'function',
		stateMutability: 'view',
		inputs: [
			{
				name: 'poolKey',
				type: 'tuple',
				components: [
					{ name: 'currency0', type: 'address' },
					{ name: 'currency1', type: 'address' },
					{ name: 'fee', type: 'uint24' },
					{ name: 'tickSpacing', type: 'int24' },
					{ name: 'hooks', type: 'address' },
				],
			},
			{ name: 'tickLower', type: 'int24' },
			{ name: 'tickUpper', type: 'int24' },
		],
		outputs: [
			{ name: 'feeGrowthInside0X128', type: 'uint256' },
			{ name: 'feeGrowthInside1X128', type: 'uint256' },
		],
	},
] as const;

// ERC20 ABI - for token metadata
export const ERC20_ABI = [
	{
		name: 'symbol',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'string' }],
	},
	{
		name: 'decimals',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'uint8' }],
	},
] as const;
