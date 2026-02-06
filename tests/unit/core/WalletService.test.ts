/**
 * WalletService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService } from '../../../src/core/WalletService';
import { ErrorCodes } from '../../../src/core/types';
import { APIError } from '@privy-io/node';

// Mock Privy client
const createMockPrivyClient = () => {
  const mockGetByTelegramUserID = vi.fn();
  const mockGetByEmailAddress = vi.fn();
  const mockGetByWalletAddress = vi.fn();
  const mockGetByCustomAuthID = vi.fn();
  const mockCreateUser = vi.fn();
  const mockCreateWallet = vi.fn();
  const mockSendTransaction = vi.fn();

  return {
    users: vi.fn(() => ({
      getByTelegramUserID: mockGetByTelegramUserID,
      getByEmailAddress: mockGetByEmailAddress,
      getByWalletAddress: mockGetByWalletAddress,
      getByCustomAuthID: mockGetByCustomAuthID,
      create: mockCreateUser,
    })),
    wallets: vi.fn(() => ({
      create: mockCreateWallet,
      ethereum: vi.fn(() => ({
        sendTransaction: mockSendTransaction,
      })),
    })),
    _mocks: {
      getByTelegramUserID: mockGetByTelegramUserID,
      getByEmailAddress: mockGetByEmailAddress,
      getByWalletAddress: mockGetByWalletAddress,
      getByCustomAuthID: mockGetByCustomAuthID,
      createUser: mockCreateUser,
      createWallet: mockCreateWallet,
      sendTransaction: mockSendTransaction,
    },
  };
};

describe('WalletService', () => {
  let walletService: WalletService;
  let mockPrivy: ReturnType<typeof createMockPrivyClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrivy = createMockPrivyClient();
    walletService = new WalletService(mockPrivy as any, undefined, ['test-policy-id-123']);

    // Set required env vars
    process.env.PRIVY_SIGNER_ID = 'test-signer-id';
    process.env.PRIVY_SIGNER_PRIVATE_KEY = 'test-auth-key-12345';
  });

  describe('connect', () => {
    it('should connect using Telegram ID (default)', async () => {
      mockPrivy._mocks.getByTelegramUserID.mockResolvedValue({
        id: 'privy-user-tg',
        linked_accounts: [{ type: 'wallet', wallet_client: 'privy', id: 'wallet-tg', address: '0xTelegramAddress' }],
      });

      const result = await walletService.connect('123456');

      expect(mockPrivy._mocks.getByTelegramUserID).toHaveBeenCalledWith({ telegram_user_id: '123456' });
      expect(result.success).toBe(true);
      expect(result.walletId).toBe('wallet-tg');
      expect(result.walletAddress).toBe('0xTelegramAddress');
    });

    it('should connect using Email', async () => {
      mockPrivy._mocks.getByEmailAddress.mockResolvedValue({
        id: 'privy-user-email',
        linked_accounts: [{ type: 'wallet', wallet_client: 'privy', id: 'wallet-email', address: '0xEmailAddress' }],
      });

      const result = await walletService.connect('test@example.com', 'email');

      expect(mockPrivy._mocks.getByEmailAddress).toHaveBeenCalledWith({ address: 'test@example.com' });
      expect(result.success).toBe(true);
      expect(result.walletId).toBe('wallet-email');
      expect(result.walletAddress).toBe('0xEmailAddress');
    });

    it('should connect using Wallet Address', async () => {
      mockPrivy._mocks.getByWalletAddress.mockResolvedValue({
        id: 'privy-user-wallet',
        linked_accounts: [{ type: 'wallet', wallet_client: 'privy', id: 'wallet-wallet', address: '0x123' }],
      });

      const result = await walletService.connect('0x123', 'wallet');

      expect(mockPrivy._mocks.getByWalletAddress).toHaveBeenCalledWith({ address: '0x123' });
      expect(result.success).toBe(true);
      expect(result.walletAddress).toBe('0x123');
    });

    it('should create new user with Email if not found', async () => {
      const apiError = Object.create(APIError.prototype);
      Object.assign(apiError, { status: 404, message: 'Not found' });
      mockPrivy._mocks.getByEmailAddress.mockRejectedValue(apiError);

      mockPrivy._mocks.createUser.mockResolvedValue({
        id: 'new-user-email',
        linked_accounts: [],
      });
      mockPrivy._mocks.createWallet.mockResolvedValue({ id: 'new-wallet-email', address: '0xNewEmailAddress' });

      const result = await walletService.connect('new@example.com', 'email');

      expect(mockPrivy._mocks.createUser).toHaveBeenCalledWith({
        linked_accounts: [{ type: 'email', address: 'new@example.com' }],
      });
      expect(result.isNewUser).toBe(true);
      expect(result.walletAddress).toBe('0xNewEmailAddress');
    });

    it('should create new user and wallet for new user (Telegram)', async () => {
      // User doesn't exist - create proper APIError
      const apiError = Object.create(APIError.prototype);
      Object.assign(apiError, { status: 404, message: 'Not found' });
      mockPrivy._mocks.getByTelegramUserID.mockRejectedValue(apiError);

      // Create user returns new user
      mockPrivy._mocks.createUser.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [],
      });

      // Create wallet returns new wallet
      mockPrivy._mocks.createWallet.mockResolvedValue({
        id: 'wallet-abc123',
        address: '0xABC123Address',
      });

      const result = await walletService.connect('telegram_123');

      expect(result.success).toBe(true);
      expect(result.walletId).toBe('wallet-abc123');
      expect(result.walletAddress).toBe('0xABC123Address');
      expect(result.privyUserId).toBe('privy-user-123');
      expect(result.isNewUser).toBe(true);
    });

    it('should create wallet with security policies', async () => {
      // Create proper APIError
      const apiError = Object.create(APIError.prototype);
      Object.assign(apiError, { status: 404, message: 'Not found' });
      mockPrivy._mocks.getByTelegramUserID.mockRejectedValue(apiError);

      mockPrivy._mocks.createUser.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [],
      });

      mockPrivy._mocks.createWallet.mockResolvedValue({
        id: 'wallet-abc123',
        address: '0xABC123Address',
      });

      await walletService.connect('telegram_123');

      // Verify policy IDs are passed to wallet creation
      expect(mockPrivy._mocks.createWallet).toHaveBeenCalledWith({
        chain_type: 'ethereum',
        owner: { user_id: 'privy-user-123' },
        additional_signers: [
          {
            signer_id: 'test-signer-id',
            override_policy_ids: ['test-policy-id-123'],
          },
        ],
      });
    });

    it('should use existing wallet for returning user (Telegram)', async () => {
      // User exists with wallet
      mockPrivy._mocks.getByTelegramUserID.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client: 'privy',
            id: 'existing-wallet-id',
            address: '0xExistingAddress',
          },
        ],
      });

      const result = await walletService.connect('telegram_123');

      expect(result.success).toBe(true);
      expect(result.walletId).toBe('existing-wallet-id');
      expect(result.walletAddress).toBe('0xExistingAddress');
      expect(result.isNewUser).toBe(false);
      expect(mockPrivy._mocks.createWallet).not.toHaveBeenCalled();
    });
  });

  describe('transact', () => {
    it('should return SESSION_NOT_FOUND for disconnected user', async () => {
      const result = await walletService.transact('unknown-user', {
        to: '0x123',
        value: '0',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(ErrorCodes.SESSION_NOT_FOUND);
    });

    it('should send transaction for connected user', async () => {
      // First connect the user
      mockPrivy._mocks.getByTelegramUserID.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client: 'privy',
            id: 'wallet-abc123',
            address: '0xTransactAddress',
          },
        ],
      });
      await walletService.connect('telegram_123');

      // Mock transaction response
      mockPrivy._mocks.sendTransaction.mockResolvedValue({
        hash: '0xtxhash123',
      });

      const result = await walletService.transact('telegram_123', {
        to: '0xrecipient',
        value: '1000000000000000000',
      });

      expect(result.success).toBe(true);
      expect(result.hash).toBe('0xtxhash123');

      // Verify authorization_context is passed
      expect(mockPrivy._mocks.sendTransaction).toHaveBeenCalledWith(
        'wallet-abc123',
        expect.objectContaining({
          authorization_context: {
            authorization_private_keys: ['test-auth-key-12345'],
          },
        })
      );
    });

    it('should return error if PRIVY_SIGNER_PRIVATE_KEY is missing', async () => {
      // First connect the user
      mockPrivy._mocks.getByTelegramUserID.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client: 'privy',
            id: 'wallet-abc123',
            address: '0xTransactAddress',
          },
        ],
      });
      await walletService.connect('telegram_123');

      // Remove private key from env
      delete process.env.PRIVY_SIGNER_PRIVATE_KEY;

      const result = await walletService.transact('telegram_123', {
        to: '0xrecipient',
        value: '1000000000000000000',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server signing configuration is missing');
    });
  });

  describe('disconnect', () => {
    it('should return wallet details when session exists', async () => {
      // Connect first
      mockPrivy._mocks.getByTelegramUserID.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client: 'privy',
            id: 'wallet-abc123',
            address: '0xDisconnectAddress',
          },
        ],
      });
      await walletService.connect('telegram_123');

      const result = walletService.disconnect('telegram_123');
      expect(result.success).toBe(true);
      expect(result.walletId).toBe('wallet-abc123');
      expect(result.walletAddress).toBe('0xDisconnectAddress');
    });

    it('should return failure when no session exists', () => {
      const result = walletService.disconnect('unknown-user');
      expect(result.success).toBe(false);
      expect(result.walletId).toBeUndefined();
      expect(result.walletAddress).toBeUndefined();
    });
  });

  describe('getSession', () => {
    it('should return session data for connected user', async () => {
      mockPrivy._mocks.getByTelegramUserID.mockResolvedValue({
        id: 'privy-user-123',
        linked_accounts: [
          {
            type: 'wallet',
            wallet_client: 'privy',
            id: 'wallet-abc123',
            address: '0xSessionAddress',
          },
        ],
      });
      await walletService.connect('telegram_123');

      const session = walletService.getSession('telegram_123');
      expect(session).toBeDefined();
      expect(session?.walletId).toBe('wallet-abc123');
      expect(session?.walletAddress).toBe('0xSessionAddress');
    });

    it('should return undefined for unknown user', () => {
      const session = walletService.getSession('unknown-user');
      expect(session).toBeUndefined();
    });
  });
});
