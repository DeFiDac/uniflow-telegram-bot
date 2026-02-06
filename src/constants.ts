export const RESPONSE_TIMEOUT = 60000;

export const ERROR_MESSAGES = {
	MISSING_FROM: 'Missing msg.from',
	MISSING_CHAT_ID: 'Missing chat ID',
	NO_SESSION: '❌ Please connect your wallet first with /connect!',
	CONNECTION_FAILED:
		'❌ Connection failed. Please try again later.\n\nIf the problem persists, please contact support.',
	DISCONNECT_FAILED:
		'❌ Failed to disconnect. Please try again.\n\nIf the problem persists, please contact support.',
	TRANSACTION_FAILED: '❌ Transaction failed. Please try again.',
	GENERIC_ERROR: '❌ An error occurred. Please try again.',
};

export const SUCCESS_MESSAGES = {
	WALLET_CONNECTED: (walletId: string) =>
		`✅ Wallet connected successfully!\n\nWallet ID: ${walletId}\n\nAvailable commands:\n/transact - Send transactions\n/disconnect - End session`,
	DISCONNECTED:
		`✅ Disconnected successfully!\n\n` +
		`Your wallet remains safe and accessible. You've simply ended this bot session.\n\n` +
		`To reconnect and use agentic features again, use /connect anytime.\n\n` +
		`Available commands:\n` +
		`/connect - Link your wallet\n` +
		`/help - View all commands`,
	TRANSACTION_SENT: (hash: string) =>
		`✅ Transaction sent successfully!\n\nTransaction Hash: ${hash}`,
};

export const INFO_MESSAGES = {
	NOT_CONNECTED: `ℹ️ You're not currently connected.\n\nUse /connect to link your wallet and start using agentic features.`,
	TRANSACTION_TIMEOUT:
		'⏱️ Transaction request timed out. Please try /transact again if you wish to proceed.',
	TRANSACTION_CANCELED: '❌ Transaction canceled.',
	INVALID_RESPONSE:
		'❌ Invalid response. Please reply with YES or NO.\n\nTo start a new transaction, use /transact again.',
};


/**
 * Uniswap V4 Contract Deployments
 *
 * Official contract addresses for Uniswap V4 across supported networks.
 * These are the core contracts for interacting with Uniswap V4 pools.
 *
 * Contracts:
 * - poolManager: Core contract that manages all pools
 * - positionManager: NFT-based position manager for liquidity positions
 * - stateView: Helper contract for reading pool state efficiently
 */

export const UNISWAP_V4_DEPLOYMENTS = {
	ethereum: {
		chainId: 1,
		poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
		positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
		stateView: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
	},
	bsc: {
		chainId: 56,
		poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
		positionManager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
		stateView: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
	},
	base: {
		chainId: 8453,
		poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
		positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
		stateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
	},
	arbitrum: {
		chainId: 42161,
		poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
		positionManager: '0xd88f38f930b7952f2db2432cb002e7abbf3dd869',
		stateView: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990',
	},
	unichain: {
		chainId: 130,
		poolManager: '0x1f98400000000000000000000000000000000004',
		positionManager: '0x4529a01c7a0410167c5740c487a8de60232617bf',
		stateView: '0x86e8631a016f9068c3f085faf484ee3f5fdee8f2',
	},
} as const;

export type NetworkName = keyof typeof UNISWAP_V4_DEPLOYMENTS;

/**
 * Get Uniswap V4 deployment addresses for a specific network
 *
 * @param network Network name (ethereum, bsc, base, arbitrum, unichain)
 * @returns Deployment addresses for the network
 * @throws Error if network is not supported
 */
export function getDeployment(network: string) {
	const normalizedNetwork = network.toLowerCase() as NetworkName;
	const deployment = UNISWAP_V4_DEPLOYMENTS[normalizedNetwork];

	if (!deployment) {
		const supportedNetworks = Object.keys(UNISWAP_V4_DEPLOYMENTS).join(', ');
		throw new Error(
			`Unsupported network: ${network}. Supported networks: ${supportedNetworks}`
		);
	}

	return deployment;
}

/**
 * Get Pool Manager address for a specific network
 *
 * @param network Network name
 * @returns Pool Manager contract address
 */
export function getPoolManagerAddress(network: string = 'ethereum'): string {
	return getDeployment(network).poolManager;
}

/**
 * Get Position Manager address for a specific network
 *
 * @param network Network name
 * @returns Position Manager contract address
 */
export function getPositionManagerAddress(network: string = 'ethereum'): string {
	// Allow environment variable override
	const envKey = `POSITION_MANAGER_${network.toUpperCase()}`;
	const envAddress = process.env[envKey];
	if (envAddress) {
		return envAddress;
	}

	return getDeployment(network).positionManager;
}

/**
 * Get State View address for a specific network
 *
 * @param network Network name
 * @returns State View contract address
 */
export function getStateViewAddress(network: string = 'ethereum'): string {
	return getDeployment(network).stateView;
}

/**
 * Get chain ID for a specific network
 *
 * @param network Network name
 * @returns Chain ID
 */
export function getChainId(network: string = 'ethereum'): number {
	return getDeployment(network).chainId;
}

/**
 * Get network name from chain ID
 *
 * @param chainId Chain ID
 * @returns Network name or undefined if not found
 */
export function getNetworkFromChainId(chainId: number): NetworkName | undefined {
	const entries = Object.entries(UNISWAP_V4_DEPLOYMENTS) as Array<
		[NetworkName, typeof UNISWAP_V4_DEPLOYMENTS[NetworkName]]
	>;

	const found = entries.find(([, deployment]) => deployment.chainId === chainId);
	return found?.[0];
}
