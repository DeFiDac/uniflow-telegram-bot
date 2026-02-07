/**
 * Core types for the UniFlow API service
 */

// Session data stored for each connected user
export interface SessionData {
	userId: string; // Privy user ID
	walletId: string; // Privy wallet ID
	walletAddress: string; // Ethereum wallet address
}

// User Identity Types
export type IdType = 'telegram' | 'email' | 'wallet' | 'custom_auth';

// Transaction parameters
export interface TxParams {
	to: string;
	value: string;
	data?: string;
	chainId?: number; // Default to Ethereum mainnet
}

// Authorization context for server-side signing
export interface AuthorizationContext {
	authorization_private_keys: string[];
}

// API Response types
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	message: string;
	error?: string;
}

// Connect endpoint response data
export interface ConnectResponseData {
	walletId: string;
	walletAddress: string;
	privyUserId: string;
	isNewUser: boolean;
}

// Transaction endpoint response data
export interface TransactResponseData {
	hash: string;
}

// Session check response data
export interface SessionResponseData {
	hasSession: boolean;
	walletId?: string;
	walletAddress?: string;
}

// Wallet service result types
export interface WalletConnectResult {
	success: boolean;
	walletId?: string;
	walletAddress?: string;
	privyUserId?: string;
	isNewUser?: boolean;
	error?: string;
}

export interface WalletTransactResult {
	success: boolean;
	hash?: string;
	error?: string;
}

export interface WalletDisconnectResult {
	success: boolean;
	walletId?: string;
	walletAddress?: string;
}

// Error codes for API responses
export const ErrorCodes = {
	SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
	WALLET_CREATION_FAILED: 'WALLET_CREATION_FAILED',
	TRANSACTION_FAILED: 'TRANSACTION_FAILED',
	INVALID_REQUEST: 'INVALID_REQUEST',
	PRIVY_ERROR: 'PRIVY_ERROR',
	INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// Policy-related types
export interface PolicyRule {
	name: string;
	method: string;
	conditions: PolicyCondition[];
	action: 'ALLOW' | 'DENY';
}

export interface PolicyCondition {
	field_source: 'ethereum_transaction';
	field: string;
	operator: 'eq' | 'in' | 'lte' | 'gte' | 'gt' | 'lt';
	value: string | string[]; // Privy API requires all values as strings
}

export interface Policy {
	id: string;
	version: string;
	name: string;
	chain_type: string;
	owner_id: string;
	rules: PolicyRule[];
	created_at: number;
}

export interface PolicyCreationResult {
	success: boolean;
	policyIds?: string[];
	error?: string;
}

// Chain configuration
export interface UniswapV4ChainConfig {
	chainId: number;
	name: string;
	positionManagerAddress: string;
	poolManagerAddress: string;
	subgraphUrl: string;
	rpcUrl: string;
}

// Uniswap V4 Position types (following official SDK guide)
export interface V4Position {
	tokenId: string;
	chainId: number;
	chainName: string;
	poolKey: {
		currency0: string;
		currency1: string;
		fee: number;
		tickSpacing: number;
		hooks: string;
	};
	tickLower: number;
	tickUpper: number;
	liquidity: string;
}

export interface V4PositionsResult {
	success: boolean;
	positions: V4Position[];
	chainErrors?: { chainId: number; error: string }[];
}

export interface V4PositionsResponseData {
	walletAddress: string;
	positions: V4Position[];
	timestamp: string;
	chainErrors?: { chainId: number; error: string }[];
}

// Chain configuration
export interface UniswapV4ChainConfig {
	chainId: number;
	name: string;
	positionManagerAddress: string;
	poolManagerAddress: string;
	subgraphUrl: string;
	rpcUrl: string;
}

// Price cache (used by PriceService - kept for future use)
export interface PriceData {
	address: string;
	symbol: string;
	priceUsd: number;
	timestamp: number;
}
