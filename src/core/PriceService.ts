/**
 * PriceService - CoinMarketCap integration for token price fetching
 */

import axios from 'axios';
import { PriceData } from './types';

export class PriceService {
	private apiKey: string;
	private priceCache: Map<string, PriceData>;
	private readonly CACHE_TTL_MS = 60000; // 1 minute
	private readonly CMC_API_BASE = 'https://pro-api.coinmarketcap.com';

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.COINMARKETCAP_API_KEY || '';
		this.priceCache = new Map();

		if (!this.apiKey) {
			console.warn(
				'⚠️  [PriceService] No CoinMarketCap API key provided - prices will not be available'
			);
		}
	}

	/**
	 * Fetch USD prices for multiple token addresses
	 * Returns Map<address, priceUsd>
	 */
	async getTokenPrices(
		addresses: string[],
		chainId: number
	): Promise<Map<string, number>> {
		const result = new Map<string, number>();

		if (!this.apiKey) {
			console.warn(
				'[PriceService] No API key - returning zero prices for all tokens'
			);
			addresses.forEach((addr) => {
				result.set(addr.toLowerCase(), 0);
			});
			return result;
		}

		// Normalize addresses to lowercase
		const normalizedAddresses = addresses.map((addr) => addr.toLowerCase());

		// Check cache first
		const uncachedAddresses: string[] = [];
		for (const address of normalizedAddresses) {
			const cached = this.getCachedPrice(address);
			if (cached) {
				result.set(address, cached.priceUsd);
			} else {
				uncachedAddresses.push(address);
			}
		}

		if (uncachedAddresses.length === 0) {
			console.log(
				`[PriceService] All ${addresses.length} prices served from cache`
			);
			return result;
		}

		// Fetch uncached prices from CoinMarketCap
		console.log(
			`[PriceService] Fetching ${uncachedAddresses.length} prices from CoinMarketCap (chainId: ${chainId})`
		);

		try {
			const platformMap: Record<number, string> = {
				1: 'ethereum',
				56: 'binance-smart-chain',
				8453: 'base',
				42161: 'arbitrum-one',
				1301: 'ethereum', // Unichain - fallback to ethereum
			};

			const platform = platformMap[chainId] || 'ethereum';

			// Step 1: Resolve contract addresses to CoinMarketCap IDs
			const addressToCmcId = new Map<string, number>();
			const cmcIdToAddress = new Map<number, string>();

			for (const address of uncachedAddresses) {
				try {
					const infoResponse = await axios.get(
						`${this.CMC_API_BASE}/v2/cryptocurrency/info`,
						{
							params: {
								address: address,
							},
							headers: {
								'X-CMC_PRO_API_KEY': this.apiKey,
							},
							timeout: 10000,
						}
					);

					if (infoResponse.data && infoResponse.data.data) {
						const data = infoResponse.data.data;
						// CMC returns data keyed by address
						const tokenInfo = data[address];

						if (tokenInfo && tokenInfo.id) {
							const cmcId = tokenInfo.id;
							addressToCmcId.set(address, cmcId);
							cmcIdToAddress.set(cmcId, address);
							console.log(
								`[PriceService] Resolved ${address} -> CMC ID ${cmcId}`
							);
						} else {
							console.warn(
								`[PriceService] No CMC ID found for ${address}`
							);
						}
					}
				} catch (error) {
					console.warn(
						`[PriceService] Failed to resolve CMC ID for ${address}:`,
						error
					);
				}
			}

			// Step 2: Fetch prices for all resolved CMC IDs
			if (addressToCmcId.size > 0) {
				const cmcIds = Array.from(addressToCmcId.values());
				const uniqueCmcIds = [...new Set(cmcIds)]; // Dedupe
				const idsParam = uniqueCmcIds.join(',');

				const quotesResponse = await axios.get(
					`${this.CMC_API_BASE}/v2/cryptocurrency/quotes/latest`,
					{
						params: {
							id: idsParam,
							convert: 'USD',
						},
						headers: {
							'X-CMC_PRO_API_KEY': this.apiKey,
						},
						timeout: 10000,
					}
				);

				if (quotesResponse.data && quotesResponse.data.data) {
					const data = quotesResponse.data.data;

					// Map prices back to addresses
					for (const [address, cmcId] of addressToCmcId.entries()) {
						const tokenData = data[cmcId];

						if (tokenData && tokenData.quote && tokenData.quote.USD) {
							const priceUsd = tokenData.quote.USD.price;
							const symbol = tokenData.symbol || 'UNKNOWN';

							// Update cache
							this.priceCache.set(address, {
								address,
								symbol,
								priceUsd,
								timestamp: Date.now(),
							});

							// Add to result
							result.set(address, priceUsd);

							console.log(
								`[PriceService] Fetched ${symbol} (${address}): $${priceUsd.toFixed(2)}`
							);
						} else {
							console.warn(
								`[PriceService] No price data for CMC ID ${cmcId} (${address})`
							);
							result.set(address, 0);
						}
					}
				}
			}

			// Set 0 for any addresses that couldn't be resolved
			for (const address of uncachedAddresses) {
				if (!result.has(address)) {
					console.warn(
						`[PriceService] Could not fetch price for ${address} - setting to 0`
					);
					result.set(address, 0);
				}
			}
		} catch (error) {
			console.error('[PriceService] Failed to fetch prices:', error);

			// On error, return 0 for uncached addresses
			uncachedAddresses.forEach((addr) => {
				result.set(addr, 0);
			});
		}

		return result;
	}

	/**
	 * Get cached price if still valid
	 */
	private getCachedPrice(address: string): PriceData | null {
		const cached = this.priceCache.get(address.toLowerCase());
		if (!cached || Date.now() - cached.timestamp > this.CACHE_TTL_MS) {
			return null;
		}
		return cached;
	}

	/**
	 * Clear all cached prices (useful for testing)
	 */
	clearCache(): void {
		this.priceCache.clear();
	}

	/**
	 * Get cache size (useful for monitoring)
	 */
	getCacheSize(): number {
		return this.priceCache.size;
	}
}
