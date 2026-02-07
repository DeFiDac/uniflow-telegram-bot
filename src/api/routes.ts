/**
 * API Routes - REST endpoints for wallet operations
 */

import { Router, Request, Response } from 'express';
import { WalletService } from '../core/WalletService';
import { UniswapV4Service } from '../core/UniswapV4Service';
import {
  ApiResponse,
  ConnectResponseData,
  TransactResponseData,
  SessionResponseData,
  V4PositionsResponseData,
  ErrorCodes,
} from '../core/types';
import { SUPPORTED_CHAIN_IDS } from '../core/v4-config';
import { validateUserId, validateTxParams } from './middleware';

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
  uniswapV4Service?: UniswapV4Service
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
      const response: ApiResponse<ConnectResponseData> = {
        success: true,
        data: {
          walletId: result.walletId,
          walletAddress: result.walletAddress,
          privyUserId: result.privyUserId!,
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
