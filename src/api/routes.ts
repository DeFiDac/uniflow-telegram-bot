/**
 * API Routes - REST endpoints for wallet operations
 */

import { Router, Request, Response } from 'express';
import { WalletService } from '../core/WalletService';
import {
  ApiResponse,
  ConnectResponseData,
  TransactResponseData,
  SessionResponseData,
  ErrorCodes,
} from '../core/types';
import { validateUserId, validateTxParams } from './middleware';

export function createRouter(walletService: WalletService): Router {
  const router = Router();

  /**
   * POST /api/connect
   * Connect a user's wallet (creates new Privy user + wallet if needed)
   */
  router.post('/connect', validateUserId, async (req: Request, res: Response) => {
    const { userId } = req.body;

    const result = await walletService.connect(userId);

    if (result.success && result.walletId) {
      const response: ApiResponse<ConnectResponseData> = {
        success: true,
        data: {
          walletId: result.walletId,
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

    const hadSession = walletService.disconnect(userId);

    if (hadSession) {
      const response: ApiResponse = {
        success: true,
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
      },
      message: session ? 'Session found' : 'No active session',
    };
    res.status(200).json(response);
  });

  return router;
}
