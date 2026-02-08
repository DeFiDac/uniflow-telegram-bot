/**
 * API Middleware - Request validation and error handling
 */

import { Request, Response, NextFunction } from 'express';
import { ApiResponse, ErrorCodes } from '../core/types';

/**
 * Validate that userId is present in request body
 */
export function validateUserId(req: Request, res: Response, next: NextFunction): void {
	const { userId } = req.body;

	if (!userId || typeof userId !== 'string' || userId.trim() === '') {
		const response: ApiResponse = {
			success: false,
			message: 'userId is required',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Normalize userId
	req.body.userId = userId.trim();
	next();
}

/**
 * Validate transaction parameters
 */
export function validateTxParams(req: Request, res: Response, next: NextFunction): void {
	const { txParams } = req.body;

	if (!txParams || typeof txParams !== 'object') {
		const response: ApiResponse = {
			success: false,
			message: 'txParams is required',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	const { to, value } = txParams;

	if (!to || typeof to !== 'string') {
		const response: ApiResponse = {
			success: false,
			message: 'txParams.to is required and must be a valid address',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	if (value === undefined || value === null || typeof value !== 'string') {
		const response: ApiResponse = {
			success: false,
			message: 'txParams.value is required and must be a string (hex or decimal)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	next();
}

/**
 * Global error handler
 */
export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	_next: NextFunction
): void {
	console.error('[API Error]', err);

	const response: ApiResponse = {
		success: false,
		message: 'An internal error occurred',
		error: ErrorCodes.INTERNAL_ERROR,
	};

	res.status(500).json(response);
}

/**
 * Sanitization helper for logs
 */
const SENSITIVE_KEYS = [
	'userId', 'password', 'token', 'secret', 'key',
	'mnemonic', 'privateKey', 'cardNumber', 'account',
	'ssn', 'transactionAmount', 'value'
];

function sanitizeData(data: any): any {
	if (!data) return data;
	if (typeof data !== 'object') return data;

	if (Array.isArray(data)) {
		return data.map(item => sanitizeData(item));
	}

	const sanitized: any = { ...data };

	for (const key of Object.keys(sanitized)) {
		// Redact if key matches sensitive list (case-insensitive partial match)
		if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
			sanitized[key] = '[REDACTED]';
		} else if (typeof sanitized[key] === 'object') {
			sanitized[key] = sanitizeData(sanitized[key]);
		}
	}

	return sanitized;
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
	const sanitizedBody = sanitizeData(req.body);
	const sanitizedParams = sanitizeData(req.params);

	console.log(`[API] ${req.method} ${req.path}`, {
		body: sanitizedBody,
		params: sanitizedParams,
	});
	next();
}

/**
 * Validate pool discovery parameters
 */
export function validatePoolDiscoveryParams(req: Request, res: Response, next: NextFunction): void {
	const { token0, token1, chainId, fee, tickSpacing } = req.query;

	// Validate token0
	if (!token0 || typeof token0 !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token0)) {
		const response: ApiResponse = {
			success: false,
			message: 'Invalid token0 address. Must be a valid Ethereum address (0x + 40 hex chars)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate token1
	if (!token1 || typeof token1 !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token1)) {
		const response: ApiResponse = {
			success: false,
			message: 'Invalid token1 address. Must be a valid Ethereum address (0x + 40 hex chars)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate chainId
	const chainIdNum = Number(chainId);
	if (!chainId || isNaN(chainIdNum) || ![1, 56, 8453, 42161, 130].includes(chainIdNum)) {
		const response: ApiResponse = {
			success: false,
			message: 'Invalid chainId. Supported: 1 (Ethereum), 56 (BSC), 8453 (Base), 42161 (Arbitrum), 130 (Unichain)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate optional fee parameter
	if (fee !== undefined) {
		const feeNum = Number(fee);
		if (typeof fee !== 'string' || isNaN(feeNum) || feeNum < 0 || !Number.isInteger(feeNum)) {
			const response: ApiResponse = {
				success: false,
				message: 'Invalid fee parameter. Must be a non-negative integer',
				error: ErrorCodes.INVALID_REQUEST,
			};
			res.status(400).json(response);
			return;
		}
	}

	// Validate optional tickSpacing parameter
	if (tickSpacing !== undefined) {
		if (fee === undefined) {
			const response: ApiResponse = {
				success: false,
				message: 'Invalid tickSpacing parameter. fee is required when tickSpacing is specified',
				error: ErrorCodes.INVALID_REQUEST,
			};
			res.status(400).json(response);
			return;
		}

		const tickSpacingNum = Number(tickSpacing);
		if (typeof tickSpacing !== 'string' || isNaN(tickSpacingNum) || tickSpacingNum <= 0 || !Number.isInteger(tickSpacingNum)) {
			const response: ApiResponse = {
				success: false,
				message: 'Invalid tickSpacing parameter. Must be a positive integer',
				error: ErrorCodes.INVALID_REQUEST,
			};
			res.status(400).json(response);
			return;
		}
	}

	next();
}

/**
 * Validate approval parameters
 */
export function validateApprovalParams(req: Request, res: Response, next: NextFunction): void {
	const { approvalParams } = req.body;

	if (!approvalParams || typeof approvalParams !== 'object') {
		const response: ApiResponse = {
			success: false,
			message: 'approvalParams is required',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	const { token, amount, chainId } = approvalParams;

	// Validate token
	if (!token || typeof token !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token)) {
		const response: ApiResponse = {
			success: false,
			message: 'approvalParams.token must be a valid Ethereum address',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate amount
	if (!amount || typeof amount !== 'string' || amount.trim() === '') {
		const response: ApiResponse = {
			success: false,
			message: 'approvalParams.amount is required (string)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate chainId
	if (!chainId || typeof chainId !== 'number' || ![1, 56, 8453, 42161, 130].includes(chainId)) {
		const response: ApiResponse = {
			success: false,
			message: 'approvalParams.chainId must be one of: 1, 56, 8453, 42161, 130',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	next();
}

/**
 * Validate mint parameters
 */
export function validateMintParams(req: Request, res: Response, next: NextFunction): void {
	const { mintParams } = req.body;

	if (!mintParams || typeof mintParams !== 'object') {
		const response: ApiResponse = {
			success: false,
			message: 'mintParams is required',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	const { token0, token1, amount0Desired, amount1Desired, chainId } = mintParams;

	// Validate token0
	if (!token0 || typeof token0 !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token0)) {
		const response: ApiResponse = {
			success: false,
			message: 'mintParams.token0 must be a valid Ethereum address',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate token1
	if (!token1 || typeof token1 !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token1)) {
		const response: ApiResponse = {
			success: false,
			message: 'mintParams.token1 must be a valid Ethereum address',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate amount0Desired
	if (
		!amount0Desired ||
		typeof amount0Desired !== 'string' ||
		isNaN(Number(amount0Desired)) ||
		Number(amount0Desired) <= 0
	) {
		const response: ApiResponse = {
			success: false,
			message: 'mintParams.amount0Desired must be a positive number (string)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate amount1Desired
	if (
		!amount1Desired ||
		typeof amount1Desired !== 'string' ||
		isNaN(Number(amount1Desired)) ||
		Number(amount1Desired) <= 0
	) {
		const response: ApiResponse = {
			success: false,
			message: 'mintParams.amount1Desired must be a positive number (string)',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	// Validate chainId
	if (!chainId || typeof chainId !== 'number' || ![1, 56, 8453, 42161, 130].includes(chainId)) {
		const response: ApiResponse = {
			success: false,
			message: 'mintParams.chainId must be one of: 1, 56, 8453, 42161, 130',
			error: ErrorCodes.INVALID_REQUEST,
		};
		res.status(400).json(response);
		return;
	}

	next();
}
