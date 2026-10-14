import type { PublicProfileStats } from './types.js';

const COUNTRY_CODES: Record<string, string> = {
    'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB',
    germany: 'DE', deutschland: 'DE', canada: 'CA', australia: 'AU', france: 'FR',
    italy: 'IT', spain: 'ES', japan: 'JP', china: 'CN',
};

function compactNumber(raw: string): number | null {
    const normalized = raw.trim().replace(/,/g, '');
    const match = normalized.match(/([\d.]+)\s*(K|M|B|万)?/i);
    if (!match) return null;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const multiplier = match[2]?.toUpperCase() === 'K' ? 1_000
        : match[2]?.toUpperCase() === 'M' ? 1_000_000
            : match[2]?.toUpperCase() === 'B' ? 1_000_000_000
                : match[2] === '万' ? 10_000 : 1;
    return Math.round(value * multiplier);
}

function matchNumber(text: string, expressions: RegExp[]): number | null {
    for (const expression of expressions) {
        const value = text.match(expression)?.[1];
        if (value) return compactNumber(value);
    }
    return null;
}

function countryCode(location: string | null): string | null {
    if (!location) return null;
    const lower = location.toLowerCase();
    for (const [country, code] of Object.entries(COUNTRY_CODES)) if (lower.includes(country)) return code;
    return location.match(/\b(US|GB|DE|AU|CA|FR|IT|ES|JP|CN)\b/i)?.[1]?.toUpperCase() ?? null;
}

/** Parses public text shown on an eBay seller profile, including localized UI. */
export function parsePublicProfileText(bodyText: string): PublicProfileStats {
    const text = bodyText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
    const feedbackRateText = text.match(/([\d.]+)\s*%\s*(?:positive|好评率)/i)?.[1];
    const feedbackRate = feedbackRateText ? Number(feedbackRateText) : null;
    const location = text.match(/(?:located in|location|所在地|位于)\s*[:：]?\s*([^|•\n]{2,100})/i)?.[1]?.trim() ?? null;
    return {
        feedback_rate: feedbackRate !== null && Number.isFinite(feedbackRate) ? feedbackRate : null,
        items_sold: matchNumber(text, [/([\d.,]+\s*[KMB万]?)\s*(?:items?\s*sold|件物品)/i, /(?:sold|已售出)\s*([\d.,]+\s*[KMB万]?)/i]),
        items_listed: matchNumber(text, [/(?:for sale|在售|选购)\s*([\d.,]+\s*[KMB万]?)/i, /([\d.,]+\s*[KMB万]?)\s*(?:items?\s*for sale|件在售)/i]),
        follower_count: matchNumber(text, [/(?:followers?|关注者)\s*([\d.,]+\s*[KMB万]?)/i, /([\d.,]+\s*[KMB万]?)\s*(?:followers?|位关注者)/i]),
        seller_country: location,
        seller_country_code: countryCode(location),
        stats_source: 'seller_profile',
    };
}
