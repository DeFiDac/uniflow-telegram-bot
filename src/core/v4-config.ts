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
	1301: 'https://rpc.unichain.org',
};

// The Graph subgraph IDs for Uniswap V4
// Source: https://thegraph.com/explorer
const SUBGRAPH_IDS: Record<number, string> = {
	1: '6XvRX3WHSvzBVTiPdF66XSBVbxWuHqijWANbjJxRDyzr', // Ethereum
	56: '2qQpC8inZPZL4tYfRQPFGZhsE8mYzE67n5z3Yf5uuKMu', // BSC
	8453: '2L6yxqUZ7dT6GWoTy9qxNBkf9kEk65me3XPMvbGsmJUZ', // Base
	42161: 'G5TsTKNi8yhPSV7kycaE23oWbqv9zzNqR49FoEQjzq1r', // Arbitrum One
	1301: 'EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH', // Unichain
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
		rpcUrl: process.env.INFURA_ETHEREUM_RPC_URL || PUBLIC_RPCS[1],
	},
	56: {
		chainId: 56,
		name: 'BSC',
		positionManagerAddress: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		subgraphUrl: buildSubgraphUrl(56),
		rpcUrl: process.env.INFURA_BSC_RPC_URL || PUBLIC_RPCS[56],
	},
	8453: {
		chainId: 8453,
		name: 'Base',
		positionManagerAddress: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		subgraphUrl: buildSubgraphUrl(8453),
		rpcUrl: process.env.BASE_RPC_URL || PUBLIC_RPCS[8453],
	},
	42161: {
		chainId: 42161,
		name: 'Arbitrum One',
		positionManagerAddress: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		subgraphUrl: buildSubgraphUrl(42161),
		rpcUrl: process.env.ARBITRUM_RPC_URL || PUBLIC_RPCS[42161],
	},
	1301: {
		chainId: 1301,
		name: 'Unichain',
		positionManagerAddress: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		poolManagerAddress: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		subgraphUrl: buildSubgraphUrl(1301),
		rpcUrl: process.env.UNICHAIN_RPC_URL || PUBLIC_RPCS[1301],
	},
};

export const SUPPORTED_CHAIN_IDS = [1, 56, 8453, 42161, 1301];

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
			{ name: 'tickLower', type: 'int24' },
			{ name: 'tickUpper', type: 'int24' },
			{ name: 'liquidity', type: 'uint128' },
		],
	},
	{
		name: 'getPositionInfo',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: 'tokenId', type: 'uint256' }],
		outputs: [
			{ name: 'liquidity', type: 'uint128' },
			{ name: 'feeGrowthInside0LastX128', type: 'uint256' },
			{ name: 'feeGrowthInside1LastX128', type: 'uint256' },
		],
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
