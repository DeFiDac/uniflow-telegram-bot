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
| `GET` | `/api/v4/positions/:walletAddress` | Get Uniswap V4 positions for a wallet |
| `GET` | `/api/v4/pool-info` | Discover pool information for token pair |
| `POST` | `/api/v4/approve` | Approve tokens via Permit2 for Uniswap V4 PositionManager |
| `POST` | `/api/v4/mint` | Mint a new Uniswap V4 liquidity position |

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

### GET /api/v4/positions/:walletAddress

Fetch Uniswap V4 liquidity positions for a wallet address.

**Query Parameters:**
- `chainId` (optional): Specific chain ID to query (1, 56, 8453, 42161, 130). If omitted, queries all supported chains.

**Example Request:**
```bash
# Query all chains
GET /api/v4/positions/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Query specific chain (Ethereum)
GET /api/v4/positions/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?chainId=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "walletAddress": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "positions": [
      {
        "tokenId": "8472",
        "chainId": 1,
        "chainName": "Ethereum",
        "poolKey": {
          "currency0": "0x0000000000000000000000000000000000000000",
          "currency1": "0xf9C8631fBA291Bac14ED549a2DDe7C7F2DDFf1A8",
          "fee": 500,
          "tickSpacing": 10,
          "hooks": "0x0000000000000000000000000000000000000000"
        },
        "tickLower": -184220,
        "tickUpper": 207220,
        "liquidity": "15196412823029214828706"
      }
    ],
    "timestamp": "2026-02-07T06:36:59.269Z",
    "chainErrors": []
  },
  "message": "Found 1 position"
}
```

**Supported Chains:**
- Ethereum (Chain ID: 1)
- BSC (Chain ID: 56)
- Base (Chain ID: 8453)
- Arbitrum (Chain ID: 42161)
- Unichain (Chain ID: 130)

### GET /api/v4/pool-info

Discover pool information for a token pair. By default, automatically tries multiple fee tiers (500, 3000, 10000) to find an existing pool. You can optionally specify a specific fee tier for faster queries.

**Query Parameters:**
- `token0` (required): First token address (0x...)
- `token1` (required): Second token address (0x...)
- `chainId` (required): Chain ID (1, 56, 8453, 42161, 130)
- `fee` (optional): Specific fee tier to query (e.g., 500, 3000, 10000). When specified, only queries this fee tier instead of trying all three, which might be faster
- `tickSpacing` (optional): Custom tick spacing for non-standard pools. Requires `fee` to be specified. If omitted, auto-derived from fee (500→10, 3000→60, 10000→200)

**Example Requests:**

Basic query (tries all fee tiers):
```bash
curl "http://localhost:3000/api/v4/pool-info?token0=0x0000000000000000000000000000000000000000&token1=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&chainId=8453"
```

Efficient query (specific fee tier - recommended when you know the fee):
```bash
curl "http://localhost:3000/api/v4/pool-info?token0=0x0000000000000000000000000000000000000000&token1=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&chainId=8453&fee=3000"
```

Custom pool query (non-standard tick spacing):
```bash
curl "http://localhost:3000/api/v4/pool-info?token0=0x0000000000000000000000000000000000000000&token1=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&chainId=8453&fee=3000&tickSpacing=100"
```

**Response (Pool Found):**
```json
{
  "success": true,
  "data": {
    "pool": {
      "exists": true,
      "poolId": "0xe070797535b13431808f8fc81fdbe7b41362960ed0b55bc2b6117c49c51b7eb9",
      "poolKey": {
        "currency0": "0x0000000000000000000000000000000000000000",
        "currency1": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "fee": 3000,
        "tickSpacing": 60,
        "hooks": "0x0000000000000000000000000000000000000000"
      },
      "currentTick": 204589,
      "sqrtPriceX96": "1461446703485210103287273052203988822378723970341",
      "liquidity": "123456789",
      "token0Symbol": "ETH",
      "token1Symbol": "USDC"
    }
  },
  "message": "Pool found with fee 3000"
}
```

**Response (No Pool):**
```json
{
  "success": true,
  "data": {
    "pool": {
      "exists": false,
      "poolKey": {
        "currency0": "0x0000000000000000000000000000000000000000",
        "currency1": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "fee": 3000,
        "tickSpacing": 60,
        "hooks": "0x0000000000000000000000000000000000000000"
      },
      "currentTick": 0,
      "sqrtPriceX96": "0",
      "liquidity": "0",
      "token0Symbol": "ETH",
      "token1Symbol": "USDC"
    }
  },
  "message": "No pool exists for this token pair"
}
```

### POST /api/v4/approve

Approve tokens for spending by the Uniswap V4 PositionManager via Permit2. Required before minting positions with ERC20 tokens (not needed for native ETH).

Uniswap V4's PositionManager settles ERC20 tokens through the [Permit2](https://docs.uniswap.org/contracts/permit2/overview) contract, not via direct `transferFrom`. This endpoint executes a two-step approval flow in a single API call:

1. **ERC20 approve to Permit2** — `token.approve(PERMIT2, amount)`
2. **Permit2 sub-allowance for PositionManager** — `permit2.approve(token, positionManager, amount, expiration)`

The Permit2 sub-allowance is set with a 30-day expiration. The returned `txHash` is from the Permit2 approval transaction (step 2).

**Request:**
```json
{
  "userId": "telegram_123456",
  "approvalParams": {
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount": "1000.0",
    "chainId": 8453
  }
}
```

**Parameters:**
- `userId`: User identifier from connect endpoint
- `approvalParams.token`: Token address to approve (must be valid ERC20)
- `approvalParams.amount`: Human-readable amount (e.g., "1000.0") or "unlimited" for max approval
- `approvalParams.chainId`: Chain ID where token exists

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "explorer": "https://basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  "message": "Token approved successfully"
}
```

**Error Response (Native ETH):**
```json
{
  "success": false,
  "message": "Approval failed",
  "error": "Native ETH does not require approval"
}
```

### POST /api/v4/mint

Mint a new Uniswap V4 liquidity position. Creates a full-range position with the specified token amounts.

**Request:**
```json
{
  "userId": "telegram_123456",
  "mintParams": {
    "token0": "0x0000000000000000000000000000000000000000",
    "token1": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "amount0Desired": "0.01",
    "amount1Desired": "25.0",
    "chainId": 8453,
    "slippageTolerance": 0.5,
    "deadline": 1234567890
  }
}
```

**Parameters:**
- `userId`: User identifier from connect endpoint
- `mintParams.token0`: First token address (use 0x0000...0000 for native ETH)
- `mintParams.token1`: Second token address
- `mintParams.amount0Desired`: Human-readable amount of token0 (e.g., "0.01")
- `mintParams.amount1Desired`: Human-readable amount of token1 (e.g., "25.0")
- `mintParams.chainId`: Chain ID for the transaction
- `mintParams.slippageTolerance` (optional): Slippage tolerance percentage (default: 0.5%)
- `mintParams.deadline` (optional): Unix timestamp deadline (default: 20 minutes from now)

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "chainId": 8453,
    "expectedPosition": {
      "poolKey": {
        "currency0": "0x0000000000000000000000000000000000000000",
        "currency1": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "fee": 3000,
        "tickSpacing": 60,
        "hooks": "0x0000000000000000000000000000000000000000"
      },
      "tickLower": -887220,
      "tickUpper": 887220,
      "liquidity": "15196412823029214828706",
      "amount0": "0.01",
      "amount1": "25.0"
    },
    "explorer": "https://basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  },
  "message": "Position minted successfully"
}
```

**Error Responses:**

Pool not found:
```json
{
  "success": false,
  "message": "Minting failed",
  "error": "No pool found for this token pair. Try different tokens or fee tiers."
}
```

Insufficient balance:
```json
{
  "success": false,
  "message": "Minting failed",
  "error": "Insufficient ETH balance. Required: 0.01, Available: 0.005"
}
```

Token not approved:
```json
{
  "success": false,
  "message": "Minting failed",
  "error": "USDC not approved. Call /api/v4/approve first with token=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
}
```

**Minting Flow:**

1. **Discover Pool**: Call `GET /api/v4/pool-info` to verify pool exists
2. **Approve Tokens** (if using ERC20): Call `POST /api/v4/approve` for each non-native token. This handles both the ERC20-to-Permit2 approval and the Permit2-to-PositionManager sub-allowance in a single call.
3. **Mint Position**: Call `POST /api/v4/mint` with desired amounts
4. **Verify Position**: Call `GET /api/v4/positions/:address` to see the new position

**Example Complete Flow:**
```bash
# Step 1: Connect wallet
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"userId": "telegram_123456"}'

# Step 2: Discover pool (ETH/USDC on Base with 0.3% fee tier)
curl "http://localhost:3000/api/v4/pool-info?token0=0x0000000000000000000000000000000000000000&token1=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&chainId=8453&fee=3000"

# Step 3: Approve USDC via Permit2 (not needed for ETH)
curl -X POST http://localhost:3000/api/v4/approve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "telegram_123456",
    "approvalParams": {
      "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "1000.0",
      "chainId": 8453
    }
  }'

# Step 4: Mint position
curl -X POST http://localhost:3000/api/v4/mint \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "telegram_123456",
    "mintParams": {
      "token0": "0x0000000000000000000000000000000000000000",
      "token1": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount0Desired": "0.01",
      "amount1Desired": "25.0",
      "chainId": 8453
    }
  }'

# Step 5: Verify position created
curl "http://localhost:3000/api/v4/positions/0xYourWalletAddress?chainId=8453"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVY_APP_ID` | ✅ | Privy application ID |
| `PRIVY_APP_SECRET` | ✅ | Privy application secret |
| `PRIVY_SIGNER_ID` | ✅ | Privy signer ID for agentic transactions |
| `PRIVY_SIGNER_PRIVATE_KEY` | ✅ | Privy authorization private key for server-side signing |
| `PRIVY_POLICY_ID` | ❌ | Privy policy ID (auto-created if not set) |
| `THE_GRAPH_API_KEY` | ✅ | The Graph API key for Uniswap V4 subgraphs |
| `INFURA_API_KEY` | ❌ | Infura API key (falls back to public RPCs) |
| `INFURA_ETHEREUM_RPC_URL` | ❌ | Infura Ethereum base URL (default: https://mainnet.infura.io/v3/) |
| `INFURA_BSC_RPC_URL` | ❌ | Infura BSC base URL (default: https://bsc-mainnet.infura.io/v3/) |
| `INFURA_BASE_RPC_URL` | ❌ | Infura Base base URL (default: https://base-mainnet.infura.io/v3/) |
| `INFURA_ARBITRUM_RPC_URL` | ❌ | Infura Arbitrum base URL (default: https://arbitrum-mainnet.infura.io/v3/) |
| `INFURA_UNICHAIN_RPC_URL` | ❌ | Infura Unichain base URL (default: https://unichain-mainnet.infura.io/v3/) |
| `PORT` | ❌ | HTTP server port (default: 3000) |

**Note:** Infura RPC URLs are constructed as `{INFURA_*_RPC_URL}{INFURA_API_KEY}`. If not configured, the service falls back to public RPC endpoints.

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

2. **Contract Allowlist**: Interactions restricted to Uniswap V4 and Permit2 contracts only:
   - Pool Manager
   - Position Manager
   - State View
   - Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) — required for ERC20 token approvals
   - ERC20 token contracts — for `approve()` calls to Permit2

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
│                                                      │
│  ┌──────────────────────────────────┐               │
│  │    UniswapV4Service              │               │
│  │  (Position fetching via          │               │
│  │   The Graph + on-chain calls)    │               │
│  └───────┬──────────────────────────┘               │
│          │                                           │
│  ┌───────▼────────┐  ┌──────────────┐               │
│  │ GraphQL Client │  │ Viem Client  │               │
│  │ (The Graph)    │  │ (RPC calls)  │               │
│  └────────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────┘
```

## Uniswap V4 Integration

UniFlow provides comprehensive Uniswap V4 integration for both reading and creating liquidity positions across multiple chains.

### Features

**Position Management:**
- ✅ Fetch existing positions (read-only)
- ✅ Discover pools with automatic fee tier detection
- ✅ Approve tokens for position manager
- ✅ Mint new full-range liquidity positions
- ✅ Multi-chain support (Ethereum, BSC, Base, Arbitrum, Unichain)

**Implementation follows official guides:**
- [Position Fetching Guide](https://docs.uniswap.org/sdk/v4/guides/liquidity/position-fetching)
- [Position Minting Guide](https://docs.uniswap.org/sdk/v4/guides/liquidity/position-minting)

### Position Fetching

**How It Works:**
1. **Position Discovery**: Queries The Graph subgraphs to find position token IDs owned by a wallet
2. **Position Details**: Fetches on-chain data for each position using the Position Manager contract:
   - Pool configuration (currencies, fee tier, hooks)
   - Position range (tick lower/upper)
   - Current liquidity

**Services:**
- `UniswapV4Service` - Handles read operations (fetching positions)

### Position Minting

**How It Works:**
1. **Pool Discovery**: Automatically tries multiple fee tiers (500, 3000, 10000) to find existing pools. For better performance, specify the `fee` parameter to query a specific tier directly.
2. **Balance Validation**: Checks user token balances before transactions
3. **Approval Checking**: Verifies Permit2 sub-allowances and provides clear instructions if needed
4. **Position Creation**: Mints full-range positions using Uniswap V4 SDK
5. **Pre-transaction Validation**: Prevents failed transactions with helpful error messages

**Services:**
- `UniswapV4MintService` - Handles write operations (discovering pools, approving tokens, minting positions)

**Position Parameters:**
- **Range**: Full-range positions (from min tick to max tick)
- **Fee Tiers**: Auto-detected (500, 3000, or 10000 basis points)
- **Slippage**: Configurable (default 0.5%)
- **Deadline**: Configurable (default 20 minutes)

### Data Sources

- **The Graph**: Subgraph queries for position ownership
- **On-chain RPC**: Contract calls for position details, pool state, balances, and approvals
- **Supported Networks**: Ethereum, BSC, Base, Arbitrum, Unichain

### Configuration

Set up your `.env` file with the required credentials:

```bash
# Required for position discovery
THE_GRAPH_API_KEY=your_thegraph_api_key

# Optional - improves reliability (falls back to public RPCs)
INFURA_API_KEY=your_infura_project_id
```

### Security Notes

All minting transactions are protected by Privy policies that:
- Restrict transactions to Uniswap V4 contracts, Permit2, and ERC20 token contracts only
- Limit transaction values to 0.1 ETH maximum
- Enforce chain allowlist (mainnet chains only)

See the **Security Policies** section for full details.
