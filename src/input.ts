import type { ActorInput, DedupeMode, Input, Marketplace, ProfileEnrichmentMode } from './types.js';

const markets = new Set<Marketplace>(['US', 'GB', 'DE', 'AU', 'CA']);
export const MARKETPLACE_BASE_URLS: Record<Marketplace, string> = {
    US: 'https://www.ebay.com',
    GB: 'https://www.ebay.co.uk',
    DE: 'https://www.ebay.de',
    AU: 'https://www.ebay.com.au',
    CA: 'https://www.ebay.ca',
};
const EU_COUNTRY_CODES = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
    'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];
const list = (value: unknown, fallback: string[], field: string): string[] => {
    const raw = value === undefined ? fallback : value;
    if (!Array.isArray(raw)) throw new Error(`${field} must be an array`);
    return [...new Set(raw.map((v) => typeof v === 'string' ? v.trim() : v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string' ? (v as { url: string }).url.trim() : '').filter(Boolean))];
};
const integer = (value: unknown, fallback: number, min: number, max: number, field: string): number => {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isInteger(resolved) || (resolved as number) < min || (resolved as number) > max) throw new Error(`${field} must be an integer between ${min} and ${max}`);
    return resolved as number;
};
const bool = (value: unknown, fallback: boolean, field: string): boolean => {
    const resolved = value === undefined ? fallback : value;
    if (typeof resolved !== 'boolean') throw new Error(`${field} must be a boolean`);
    return resolved;
};
const optionalIdentifier = (value: unknown, field: string): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new Error(`${field} must be a string`);
    const resolved = value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(resolved)) throw new Error(`${field} is invalid`);
    return resolved;
};

export function normalizeInput(raw: ActorInput | null | undefined): Input {
    const data = raw ?? {};
    const rawCountry = data.country === 'UK' ? 'GB' : data.country;
    const country = (rawCountry ?? 'GB') as Marketplace;
    if (!markets.has(country)) throw new Error('Unsupported country');
    const requestedCountryFilters = list(data.sellerCountries, [], 'sellerCountries').map((value) => {
        const countryCode = value.toUpperCase();
        return countryCode === 'UK' ? 'GB' : countryCode;
    });
    const countryFilters = requestedCountryFilters.length ? requestedCountryFilters : [country];
    if (countryFilters.some((value) => value !== 'EU' && !/^[A-Z]{2}$/.test(value))) throw new Error('sellerCountries must contain ISO alpha-2 codes or EU');
    const sellerCountries = [...new Set(countryFilters.flatMap((value) => value === 'EU' ? EU_COUNTRY_CODES : value))];
    const dedupeMode = (data.dedupeMode ?? 'new_and_updated') as DedupeMode;
    if (!['all', 'new_only', 'new_and_updated'].includes(dedupeMode)) throw new Error('Invalid dedupeMode');
    const startUrls = list(data.startUrls, [], 'startUrls');
    for (const url of startUrls) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !/(^|\.)ebay\.(com|co\.uk|de|com\.au|ca)$/i.test(parsed.hostname)) throw new Error('startUrls must be public HTTPS eBay marketplace URLs');
    }
    const maxSellers = integer(data.maxSellers, 50, 1, 200, 'maxSellers');
    const maxProfileEnrichmentHosts = integer(data.maxProfileEnrichmentHosts, maxSellers, 1, 200, 'maxProfileEnrichmentHosts');
    const profileEnrichmentMode = (data.profileEnrichmentMode ?? 'auto') as ProfileEnrichmentMode;
    if (!['auto', 'direct', 'bright_data'].includes(profileEnrichmentMode)) throw new Error('Invalid profileEnrichmentMode');
    return {
        campaignId: optionalIdentifier(data.campaignId, 'campaignId'),
        shardId: optionalIdentifier(data.shardId, 'shardId'),
        searchQueries: list(data.searchQueries, [], 'searchQueries'),
        startUrls,
        sellerUsernames: list(data.sellerUsernames, [], 'sellerUsernames'),
        country,
        sellerCountries,
        maxLiveSessions: integer(data.maxLiveSessions, 100, 1, 500, 'maxLiveSessions'),
        maxSellers,
        maxProfileEnrichmentHosts,
        minFollowerCount: integer(data.minFollowerCount, 0, 0, 100_000_000, 'minFollowerCount'),
        includeEndedLives: bool(data.includeEndedLives, true, 'includeEndedLives'),
        enrichProfiles: bool(data.enrichProfiles, true, 'enrichProfiles'),
        profileEnrichmentMode,
        maxConcurrency: integer(data.maxConcurrency, 1, 1, 3, 'maxConcurrency'),
        maxProfileConcurrency: integer(data.maxProfileConcurrency, 2, 1, 5, 'maxProfileConcurrency'),
        maxRequestRetries: integer(data.maxRequestRetries, 2, 0, 5, 'maxRequestRetries'),
        navigationTimeoutSecs: integer(data.navigationTimeoutSecs, 60, 15, 180, 'navigationTimeoutSecs'),
        dedupeMode,
        dedupeStoreName: typeof data.dedupeStoreName === 'string' && /^[a-zA-Z0-9._-]{3,63}$/.test(data.dedupeStoreName) ? data.dedupeStoreName : 'ebay-live-lead-state-v1',
        proxyConfiguration: data.proxyConfiguration && typeof data.proxyConfiguration === 'object' ? data.proxyConfiguration as Record<string, unknown> : { useApifyProxy: false },
    };
}
