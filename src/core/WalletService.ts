/**
 * WalletService - Core wallet operations using Privy
 * This service is platform-agnostic and can be used by both API and Telegram handlers
 */

import { PrivyClient, APIError } from '@privy-io/node';
import {
  SessionData,
  TxParams,
  WalletConnectResult,
  WalletTransactResult,
  WalletDisconnectResult,
  ErrorCodes,
  IdType,
  AuthorizationContext,
} from './types';

export class WalletService {
  private privy: PrivyClient;
  private sessions: Map<string, SessionData>;
  private policyIds: string[];

  constructor(privy: PrivyClient, sessions?: Map<string, SessionData>, policyIds?: string[]) {
    this.privy = privy;
    this.sessions = sessions || new Map();
    this.policyIds = policyIds || [];
  }

  /**
   * Connect a user's wallet. Creates a new Privy user and wallet if needed.
   * @param externalUserId - External user identifier (e.g., Telegram user ID, session UUID)
   * @param idType - Type of the identifier (default: 'telegram')
   */
  async connect(externalUserId: string, idType: IdType = 'telegram'): Promise<WalletConnectResult> {
    try {
      console.log(`[WalletService] Connecting wallet for user: ${externalUserId} type: ${idType}`);

      let privyUser;
      let isNewUser = false;

      try {
        // Check if a Privy user exists with this external user ID
        switch (idType) {
          case 'telegram':
            privyUser = await this.privy.users().getByTelegramUserID({
              telegram_user_id: externalUserId,
            });
            break;
          case 'email':
            privyUser = await this.privy.users().getByEmailAddress({
              address: externalUserId,
            });
            break;
          case 'wallet':
            privyUser = await this.privy.users().getByWalletAddress({
              address: externalUserId,
            });
            break;
          case 'custom_auth':
            privyUser = await this.privy.users().getByCustomAuthID({
              custom_user_id: externalUserId,
            });
            break;
          default:
            throw new Error(`Unsupported idType: ${idType}`);
        }

        console.log(`[WalletService] Found existing Privy user: ${privyUser.id}`);
      } catch (error) {
        if (error instanceof APIError && error.status === 404) {
          // Create new user
          console.log(`[WalletService] Creating new Privy user for ${externalUserId} (${idType})`);
          isNewUser = true;

          let linkedAccount: any;
          switch (idType) {
            case 'telegram':
              linkedAccount = { type: 'telegram', telegram_user_id: externalUserId };
              break;
            case 'email':
              linkedAccount = { type: 'email', address: externalUserId };
              break;
            case 'wallet':
              // Wallet creation typically implies importing a wallet or using a wallet to login.
              // Creating a *user* via wallet address usually means importing that wallet.
              linkedAccount = { type: 'wallet', address: externalUserId, chain_type: 'ethereum' };
              break;
            case 'custom_auth':
              linkedAccount = { type: 'custom_auth', custom_user_id: externalUserId };
              break;
          }

          if (!linkedAccount) {
            throw new Error(`Cannot create user with unsupported idType: ${idType}`);
          }

          privyUser = await this.privy.users().create({
            linked_accounts: [linkedAccount],
          });
          console.log(`[WalletService] Created new Privy user: ${privyUser.id}`);
        } else {
          throw error;
        }
      }

      if (!privyUser || !privyUser.id) {
        return {
          success: false,
          error: ErrorCodes.WALLET_CREATION_FAILED,
        };
      }

      // Find or create wallet
      let walletId: string;
      let walletAddress: string;
      const existingWallet = privyUser.linked_accounts.find((acc) => acc.type === 'wallet');

      const hasEmbeddedWalletId =
        existingWallet &&
        'wallet_client' in existingWallet &&
        existingWallet.wallet_client === 'privy' &&
        'id' in existingWallet &&
        typeof existingWallet.id === 'string';

      if (hasEmbeddedWalletId) {
        walletId = (existingWallet as { id: string; address: string }).id;
        walletAddress = (existingWallet as { id: string; address: string }).address;
        console.log(`[WalletService] Using existing embedded wallet: ${walletId} (${walletAddress})`);
      } else {
        // Create new wallet with agentic signer
        console.log(`[WalletService] Creating new wallet for user ${privyUser.id}`);

        const signerId = process.env.PRIVY_SIGNER_ID;
        if (!signerId) {
          return {
            success: false,
            error: 'PRIVY_SIGNER_ID environment variable is not configured',
          };
        }

        const wallet = await this.privy.wallets().create({
          chain_type: 'ethereum',
          owner: { user_id: privyUser.id },
          additional_signers: [
            {
              signer_id: signerId,
              override_policy_ids: this.policyIds,
            },
          ],
        });
        walletId = wallet.id;
        walletAddress = wallet.address;
        console.log(`[WalletService] Created wallet: ${walletId} (${walletAddress})`);
      }

      // Store session
      this.sessions.set(externalUserId, {
        userId: privyUser.id,
        walletId,
        walletAddress,
      });

      return {
        success: true,
        walletId,
        walletAddress,
        privyUserId: privyUser.id,
        isNewUser,
      };
    } catch (error) {
      console.error('[WalletService] Connect error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : ErrorCodes.PRIVY_ERROR,
      };
    }
  }

  /**
   * Execute a transaction for a connected user
   * @param externalUserId - External user identifier
   * @param txParams - Transaction parameters
   */
  async transact(externalUserId: string, txParams: TxParams): Promise<WalletTransactResult> {
    try {
      console.log(`[WalletService] Transaction request for user: ${externalUserId}`);

      const session = this.sessions.get(externalUserId);
      if (!session) {
        console.log(`[WalletService] No session found for user: ${externalUserId}`);
        return {
          success: false,
          error: ErrorCodes.SESSION_NOT_FOUND,
        };
      }

      // Default to Ethereum mainnet if chainId not specified
      const chainId = txParams.chainId || 1;
      const caip2 = `eip155:${chainId}`;

      console.log(`[WalletService] Sending transaction on ${caip2} for wallet ${session.walletId}`);

      // Convert value to hex if it's not already
      let hexValue = txParams.value;
      if (!hexValue.startsWith('0x')) {
        // Convert decimal string to hex
        hexValue = '0x' + BigInt(hexValue).toString(16);
      }

      // Get the authorization private key
      const authPrivateKey = process.env.PRIVY_SIGNER_PRIVATE_KEY;
      if (!authPrivateKey) {
        console.error('[WalletService] PRIVY_SIGNER_PRIVATE_KEY is not configured');
        return {
          success: false,
          error: 'Server signing configuration is missing',
        };
      }

      // Build authorization context
      const authorizationContext: AuthorizationContext = {
        authorization_private_keys: [authPrivateKey],
      };

      console.log('[WalletService] Authorization context initialized for server signing');

      const txResponse = await this.privy
        .wallets()
        .ethereum()
        .sendTransaction(session.walletId, {
          caip2,
          params: {
            transaction: {
              to: txParams.to,
              value: hexValue,
              data: txParams.data || '0x',
            },
          },
          authorization_context: authorizationContext,
        });

      console.log(`[WalletService] Transaction successful: ${txResponse.hash}`);

      return {
        success: true,
        hash: txResponse.hash,
      };
    } catch (error) {
      console.error('[WalletService] Transaction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : ErrorCodes.TRANSACTION_FAILED,
      };
    }
  }

  /**
   * Disconnect a user's session
   * @param externalUserId - External user identifier
   */
  disconnect(externalUserId: string): WalletDisconnectResult {
    console.log(`[WalletService] Disconnecting user: ${externalUserId}`);
    const session = this.sessions.get(externalUserId);

    if (session) {
      this.sessions.delete(externalUserId);
      return {
        success: true,
        walletId: session.walletId,
        walletAddress: session.walletAddress,
      };
    }

    return { success: false };
  }

  /**
   * Check if a user has an active session
   * @param externalUserId - External user identifier
   */
  getSession(externalUserId: string): SessionData | undefined {
    return this.sessions.get(externalUserId);
  }

  /**
   * Clear all sessions (for graceful shutdown)
   */
  clearAllSessions(): void {
    console.log(`[WalletService] Clearing all sessions (${this.sessions.size} active)`);
    this.sessions.clear();
  }
}
