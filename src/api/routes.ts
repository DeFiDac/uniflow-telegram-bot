/**
 * API Routes - REST endpoints for wallet operations
 */

import { Router, Request, Response } from 'express';
import { WalletService } from '../core/WalletService';
import { UniswapV4Service } from '../core/UniswapV4Service';
import { UniswapV4MintService } from '../core/UniswapV4MintService';
import {
	ApiResponse,
	ConnectResponseData,
	TransactResponseData,
	SessionResponseData,
	V4PositionsResponseData,
	V4PoolDiscoveryParams,
	V4PoolDiscoveryResponseData,
	V4ApprovalResponseData,
	V4MintResponseData,
	ErrorCodes,
} from '../core/types';
import { SUPPORTED_CHAIN_IDS } from '../core/v4-config';
import {
	validateUserId,
	validateTxParams,
	validatePoolDiscoveryParams,
	validateApprovalParams,
	validateMintParams,
} from './middleware';

/**
 * Strictly validate and parse chainId from string
 * Rejects strings like "1abc" that parseInt would accept
 */
function parseChainIdStrict(raw: string): number | null {
	// Method 1: Check if string contains only digits
	if (!/^\d+$/.test(raw)) {
		return null;
	}

	// Method 2: Verify Number conversion round-trips exactly
	const num = Number(raw);
	if (!Number.isInteger(num) || String(num) !== raw) {
		return null;
	}

	return num;
}

export function createRouter(
	walletService: WalletService,
	uniswapV4Service?: UniswapV4Service,
	uniswapV4MintService?: UniswapV4MintService
): Router {
	const router = Router();

	/**
	 * POST /api/connect
	 * Connect a user's wallet (creates new Privy user + wallet if needed)
	 */
	router.post('/connect', validateUserId, async (req: Request, res: Response) => {
		const { userId } = req.body;

		const result = await walletService.connect(userId);

		if (result.success && result.walletId && result.walletAddress) {
			if (!result.privyUserId) {
				const response: ApiResponse = {
					success: false,
					message: 'Connection succeeded but user ID unavailable',
					error: ErrorCodes.INTERNAL_ERROR,
				}

				res.status(500).json(response);
				return;
			}

			const response: ApiResponse<ConnectResponseData> = {
				success: true,
				data: {
					walletId: result.walletId,
					walletAddress: result.walletAddress,
					privyUserId: result.privyUserId,
					isNewUser: result.isNewUser || false,
				},
				message: result.isNewUser
					? 'New wallet created successfully'
					: 'Wallet connected successfully',
			};
			res.status(200).json(response);
		} else {
			const response: ApiResponse = {
				success: false,
				message: 'Failed to connect wallet',
				error: result.error || ErrorCodes.WALLET_CREATION_FAILED,
			};
			res.status(500).json(response);
		}
	});

	/**
	 * POST /api/transact
	 * Execute a transaction for a connected user
	 */
	router.post(
		'/transact',
		validateUserId,
		validateTxParams,
		async (req: Request, res: Response) => {
			const { userId, txParams } = req.body;

			const result = await walletService.transact(userId, txParams);

			if (result.success && result.hash) {
				const response: ApiResponse<TransactResponseData> = {
					success: true,
					data: { hash: result.hash },
					message: 'Transaction sent successfully',
				};
				res.status(200).json(response);
			} else if (result.error === ErrorCodes.SESSION_NOT_FOUND) {
				const response: ApiResponse = {
					success: false,
					message: 'No active session. Please connect first.',
					error: ErrorCodes.SESSION_NOT_FOUND,
				};
				res.status(401).json(response);
			} else {
				const response: ApiResponse = {
					success: false,
					message: 'Transaction failed',
					error: result.error || ErrorCodes.TRANSACTION_FAILED,
				};
				res.status(500).json(response);
			}
		}
	);

	/**
	 * POST /api/disconnect
	 * End a user's session
	 */
	router.post('/disconnect', validateUserId, (req: Request, res: Response) => {
		const { userId } = req.body;

		const result = walletService.disconnect(userId);

		if (result.success) {
			const response: ApiResponse<{ walletId?: string; walletAddress?: string }> = {
				success: true,
				data: {
					walletId: result.walletId,
					walletAddress: result.walletAddress,
				},
				message: 'Disconnected successfully',
			};
			res.status(200).json(response);
		} else {
			const response: ApiResponse = {
				success: true,
				message: 'No active session to disconnect',
			};
			res.status(200).json(response);
		}
	});

	/**
	 * GET /api/session/:userId
	 * Check if a user has an active session
	 */
	router.get('/session/:userId', (req: Request, res: Response) => {
		const userId = req.params.userId as string;

		if (!userId || userId.trim() === '') {
			const response: ApiResponse = {
				success: false,
				message: 'userId parameter is required',
				error: ErrorCodes.INVALID_REQUEST,
			};
			res.status(400).json(response);
			return;
		}

		const session = walletService.getSession(userId.trim());

		const response: ApiResponse<SessionResponseData> = {
			success: true,
			data: {
				hasSession: !!session,
				walletId: session?.walletId,
				walletAddress: session?.walletAddress,
			},
			message: session ? 'Session found' : 'No active session',
		};
		res.status(200).json(response);
	});

	/**
	 * GET /api/v4/pool-info?token0=0x...&token1=0x...&chainId=1&fee=3000&tickSpacing=60
	 * Discover pool information for a token pair
	 */
	if (uniswapV4MintService) {
		router.get(
			'/v4/pool-info',
			validatePoolDiscoveryParams,
			async (req: Request, res: Response) => {
				const { token0, token1, chainId, fee, tickSpacing } = req.query;

				// Normalize addresses to lowercase
				const normalizedToken0 = (token0 as string).toLowerCase();
				const normalizedToken1 = (token1 as string).toLowerCase();

				const discoveryParams: V4PoolDiscoveryParams = {
					token0: normalizedToken0,
					token1: normalizedToken1,
					chainId: Number(chainId),
				};

				// Add optional parameters if provided
				if (fee !== undefined) {
					discoveryParams.fee = Number(fee);
				}
				if (tickSpacing !== undefined) {
					discoveryParams.tickSpacing = Number(tickSpacing);
				}

				const result = await uniswapV4MintService.discoverPool(discoveryParams);

				if (result.success && result.pool) {
					const response: ApiResponse<V4PoolDiscoveryResponseData> = {
						success: true,
						data: { pool: result.pool },
						message: result.pool.exists
							? `Pool found with fee ${result.pool.poolKey.fee}`
							: 'No pool exists for this token pair',
					};
					res.status(200).json(response);
				} else {
					const response: ApiResponse = {
						success: false,
						message: 'Pool discovery failed',
						error: result.error || ErrorCodes.INTERNAL_ERROR,
					};
					res.status(500).json(response);
				}
			}
		);

		/**
		 * POST /api/v4/approve
		 * Approve tokens for Uniswap V4 PositionManager
		 */
		router.post(
			'/v4/approve',
			validateUserId,
			validateApprovalParams,
			async (req: Request, res: Response) => {
				const { userId, approvalParams } = req.body;
				const result = await uniswapV4MintService.approveToken(
					userId,
					approvalParams,
					walletService
				);

				if (result.success && result.txHash) {
					const explorerUrls: Record<number, string> = {
						1: 'https://etherscan.io',
						56: 'https://bscscan.com',
						8453: 'https://basescan.org',
						42161: 'https://arbiscan.io',
						130: 'https://unichain.org/explorer',
					};
					const baseUrl = explorerUrls[approvalParams.chainId] || 'https://etherscan.io';
					const explorerUrl = `${baseUrl}/tx/${result.txHash}`;

					const response: ApiResponse<V4ApprovalResponseData> = {
						success: true,
						data: {
							txHash: result.txHash,
							explorer: explorerUrl,
						},
						message: 'Token approved successfully',
					};
					res.status(200).json(response);
				} else if (result.error === ErrorCodes.SESSION_NOT_FOUND) {
					const response: ApiResponse = {
						success: false,
						message: 'No active session. Please connect first.',
						error: ErrorCodes.SESSION_NOT_FOUND,
					};
					res.status(401).json(response);
				} else {
					const response: ApiResponse = {
						success: false,
						message: 'Approval failed',
						error: result.error || ErrorCodes.TRANSACTION_FAILED,
					};
					res.status(500).json(response);
				}
			}
		);

		/**
		 * POST /api/v4/mint
		 * Mint a new Uniswap V4 liquidity position
		 */
		router.post(
			'/v4/mint',
			validateUserId,
			validateMintParams,
			async (req: Request, res: Response) => {
				const { userId, mintParams } = req.body;
				const result = await uniswapV4MintService.mintPosition(
					userId,
					mintParams,
					walletService
				);

				if (result.success && result.txHash && result.expectedPosition) {
					if (!result.chainId || !result.explorer) {
						const response: ApiResponse = {
							success: false,
							message: 'Minting succeeded but response incomplete',
							error: ErrorCodes.INTERNAL_ERROR,
						};
						res.status(500).json(response);
						return;
					}

					const response: ApiResponse<V4MintResponseData> = {
						success: true,
						data: {
							txHash: result.txHash,
							chainId: result.chainId,
							expectedPosition: result.expectedPosition,
							explorer: result.explorer,
						},
						message: 'Position minted successfully',
					};
					res.status(200).json(response);
				} else if (result.error === ErrorCodes.SESSION_NOT_FOUND) {
					const response: ApiResponse = {
						success: false,
						message: 'No active session. Please connect first.',
						error: ErrorCodes.SESSION_NOT_FOUND,
					};
					res.status(401).json(response);
				} else {
					const response: ApiResponse = {
						success: false,
						message: 'Minting failed',
						error: result.error || ErrorCodes.TRANSACTION_FAILED,
					};
					res.status(500).json(response);
				}
			}
		);
	}

	/**
	 * GET /api/v4/positions/:walletAddress?chainId=1
	 * Fetch Uniswap V4 positions for wallet address
	 */
	if (uniswapV4Service) {
		router.get('/v4/positions/:walletAddress', async (req: Request, res: Response) => {
			const walletAddress = req.params.walletAddress as string;
			const chainIdParam = req.query.chainId;

			// Validate wallet address format (0x + 40 hex chars)
			if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
				const response: ApiResponse = {
					success: false,
					message: 'Invalid wallet address format',
					error: ErrorCodes.INVALID_REQUEST,
				};
				res.status(400).json(response);
				return;
			}

			// Validate chainId if provided
			let chainId: number | undefined;
			if (chainIdParam) {
				// Normalize to string
				let chainIdStr: string;
				if (typeof chainIdParam === 'string') {
					chainIdStr = chainIdParam;
				} else if (Array.isArray(chainIdParam)) {
					chainIdStr = String(chainIdParam[0]);
				} else {
					chainIdStr = String(chainIdParam);
				}

				// Strictly parse chainId (rejects "1abc", etc.)
				const parsedChainId = parseChainIdStrict(chainIdStr);
				if (parsedChainId === null || !SUPPORTED_CHAIN_IDS.includes(parsedChainId)) {
					const response: ApiResponse = {
						success: false,
						message: `Invalid chainId. Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
						error: ErrorCodes.INVALID_REQUEST,
					};
					res.status(400).json(response);
					return;
				}

				chainId = parsedChainId;
			}

			const result = await uniswapV4Service.getPositions(walletAddress, chainId);

			const responseData: V4PositionsResponseData = {
				walletAddress,
				positions: result.positions,
				timestamp: new Date().toISOString(),
				chainErrors: result.chainErrors,
			};

			const response: ApiResponse<V4PositionsResponseData> = {
				success: true,
				data: responseData,
				message: `Found ${result.positions.length} position${result.positions.length !== 1 ? 's' : ''}`,
			};
			res.status(200).json(response);
		});
	}

	return router;
}
