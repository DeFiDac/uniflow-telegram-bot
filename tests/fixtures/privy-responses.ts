export const mockPrivyUser = {
	id: 'privy_user_123',
	linked_accounts: [],
	created_at: Date.now(),
};

export const mockPrivyUserWithWallet = {
	id: 'privy_user_123',
	linked_accounts: [
		{
			type: 'wallet' as const,
			address: '0x1234567890abcdef',
			wallet_client: 'privy' as const,
			id: 'id2tptkqrxd39qo9j423etij',
		},
	],
	created_at: Date.now(),
};

export const mockWallet = {
	id: 'id2tptkqrxd39qo9j423etij',
	address: '0x1234567890abcdef',
	chain_type: 'ethereum',
};

export const mockTransactionResponse = {
	hash: '0xabcdef1234567890',
	status: 'success',
};
