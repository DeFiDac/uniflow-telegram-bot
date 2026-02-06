# UniFlow API

HTTP API service for wallet operations powered by Privy.

## Overview

UniFlow provides REST API endpoints for wallet management that can be consumed by external services (e.g., Telegram bots, web frontends).

Built with TypeScript, Express, and @privy-io/node.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/connect` | Connect/create wallet for user |
| `POST` | `/api/transact` | Execute a transaction |
| `POST` | `/api/disconnect` | End user session |
| `GET` | `/api/session/:userId` | Check if user has active session |

### POST /api/connect

Create or retrieve a wallet for a user.

**Request:**
```json
{
  "userId": "telegram_123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "walletId": "abc123xyz",
    "privyUserId": "did:privy:...",
    "isNewUser": true
  },
  "message": "New wallet created successfully"
}
```

### POST /api/transact

Execute a blockchain transaction.

**Request:**
```json
{
  "userId": "telegram_123456",
  "txParams": {
    "to": "0x...",
    "value": "1000000000000000000",
    "data": "0x",
    "chainId": 1
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hash": "0x..."
  },
  "message": "Transaction sent successfully"
}
```

### POST /api/disconnect

End user session (wallet remains safe).

**Request:**
```json
{
  "userId": "telegram_123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Disconnected successfully"
}
```

### GET /api/session/:userId

Check if user has an active session.

**Response:**
```json
{
  "success": true,
  "data": {
    "hasSession": true,
    "walletId": "abc123xyz"
  },
  "message": "Session found"
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVY_APP_ID` | ✅ | Privy application ID |
| `PRIVY_APP_SECRET` | ✅ | Privy application secret |
| `PRIVY_SIGNER_ID` | ✅ | Privy signer ID for agentic transactions |
| `PRIVY_SIGNER_PRIVATE_KEY` | ✅ | Privy authorization private key for server-side signing |
| `PORT` | ❌ | HTTP server port (default: 3000) |

## Running

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Production
pnpm build
pnpm start
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## Server-Side Transaction Signing

UniFlow uses Privy's authorization keys to enable server-side transaction signing. The server constructs an authorization context using `PRIVY_SIGNER_PRIVATE_KEY` and passes it to Privy's sendTransaction method, allowing automatic transaction signing without user interaction.

### Security Notes
- Keep `PRIVY_SIGNER_PRIVATE_KEY` secure - never expose to clients
- Use only in trusted server environments
- Implement proper authentication on `/api/transact` in production

## Security Policies

UniFlow implements conservative security policies on the Privy authorization key to protect user wallets from unauthorized transactions.

### Policy Restrictions

1. **Chain Allowlist**: Transactions only allowed on:
   - Ethereum Mainnet (Chain ID: 1)
   - Arbitrum (Chain ID: 42161)
   - Base (Chain ID: 8453)
   - Unichain (Chain ID: 130)
   - BSC (Chain ID: 56)

2. **Contract Allowlist**: Interactions restricted to Uniswap V4 contracts only:
   - Pool Manager
   - Position Manager
   - State View

3. **Transaction Value Limit**: Maximum 0.1 ETH per transaction

### How It Works

Policies are automatically created on server startup:
1. Server checks if policy exists by name
2. If not found, creates new policy via Privy API
3. Policy is owned by `PRIVY_SIGNER_ID` (only the authorization key can modify it)
4. Policy IDs are passed to wallet creation in `additional_signers.override_policy_ids`
5. Privy enforces these policies on all transactions signed by the authorization key

### Security Notes

- Policies are enforced at the Privy API level, not application level
- Server fails to start if policy initialization fails (fail-closed security)
- Policy owner is the authorization key itself, preventing unauthorized modifications
- Contract addresses are sourced from `src/constants.ts`

### Troubleshooting

**Server fails to start with policy errors:**

The server will display a detailed error box with specific troubleshooting steps. Common issues:

1. **"PRIVY_SIGNER_ID not configured"**
   - Set the `PRIVY_SIGNER_ID` environment variable
   - This should be your authorization key ID from Privy dashboard

2. **"Privy API authentication failed"**
   - Verify `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are correct
   - Check that credentials have policy creation permissions
   - Ensure the Privy app is active

3. **"Privy API rate limit exceeded"**
   - Wait a few minutes before restarting
   - Check for other services making excessive API calls

4. **"Privy API error"**
   - Check Privy status page for outages
   - Review the full error details in logs
   - Contact Privy support if needed

**Policy updates needed:**
- Modify `src/core/policyConfig.ts` with new rules
- Redeploy the service
- Existing policy will be validated and warnings logged if different

## Error Codes

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | User needs to connect first |
| `WALLET_CREATION_FAILED` | Failed to create wallet |
| `TRANSACTION_FAILED` | Transaction execution failed |
| `INVALID_REQUEST` | Missing or invalid request parameters |
| `PRIVY_ERROR` | Privy API error |
| `INTERNAL_ERROR` | Internal server error |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   External Clients                   │
│         (Telegram Bot, Web Frontend, etc.)          │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP/REST
                        ▼
┌─────────────────────────────────────────────────────┐
│                   UniFlow API                        │
│  ┌───────────────┐  ┌───────────────┐               │
│  │   Express     │  │   Middleware  │               │
│  │   Routes      │  │   (Validation)│               │
│  └───────┬───────┘  └───────────────┘               │
│          │                                           │
│  ┌───────▼───────────────────────────┐              │
│  │         WalletService             │              │
│  │   (Platform-agnostic logic)       │              │
│  └───────┬───────────────────────────┘              │
│          │                                           │
│  ┌───────▼───────┐  ┌───────────────┐               │
│  │  Privy Client │  │   Sessions    │               │
│  └───────────────┘  └───────────────┘               │
└─────────────────────────────────────────────────────┘
```
