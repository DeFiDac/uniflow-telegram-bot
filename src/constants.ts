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
