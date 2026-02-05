/**
 * Core types for the UniFlow API service
 */

// Session data stored for each connected user
export interface SessionData {
	userId: string; // Privy user ID
	walletId: string; // Privy wallet ID
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
}

// Wallet service result types
export interface WalletConnectResult {
	success: boolean;
	walletId?: string;
	privyUserId?: string;
	isNewUser?: boolean;
	error?: string;
}

export interface WalletTransactResult {
	success: boolean;
	hash?: string;
	error?: string;
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
