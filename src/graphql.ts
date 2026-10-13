import type { Response } from 'playwright';

export interface GraphqlCapture {
    operation_name: string | null;
    variable_keys: string[];
    response: unknown;
}

export interface GraphqlSignal {
    path: string;
    keys: string[];
    samples: Record<string, string | number | boolean | null>;
}

export interface GraphqlFeedShape {
    path: string;
    fields: Array<{ path: string; keys: string[]; samples: Record<string, string | number | boolean | null> }>;
}

export interface SellerProfileShape {
    host_keys: string[];
    host_samples: Record<string, string | number | boolean | null>;
    profile_keys: string[];
    profile_samples: Record<string, string | number | boolean | null>;
}

function parseJson(value: string | null): unknown {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/** Captures only eBay's public Live GraphQL transport, never account data. */
export async function captureGraphqlResponse(response: Response): Promise<GraphqlCapture | null> {
    if (!/\/d\/graphql(?:\?|$)/i.test(response.url())) return null;

    const requestData = parseJson(response.request().postData());
    const request = requestData && typeof requestData === 'object' ? requestData as Record<string, unknown> : {};
    const variables = request.variables && typeof request.variables === 'object' && !Array.isArray(request.variables)
        ? request.variables as Record<string, unknown>
        : {};
    const responseData = parseJson(await response.text());
    if (!responseData) return null;

    return {
        operation_name: typeof request.operationName === 'string' ? request.operationName : null,
        variable_keys: Object.keys(variables).sort(),
        response: responseData,
    };
}

/**
 * Records only structural diagnostics from a public GraphQL response. This is
 * intentionally bounded: it helps map a volatile front-end payload without
 * persisting full listings, buyer data, or HTML fragments.
 */
export function inspectGraphqlResponse(value: unknown, maximum = 40): GraphqlSignal[] {
    const results: GraphqlSignal[] = [];
    const relevant = /(live|stream|host|seller|creator|channel|event|feed)/i;
    const scalar = (value: unknown): string | number | boolean | null | undefined => {
        if (typeof value === 'string') return value.slice(0, 120);
        if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
        return undefined;
    };
    const visit = (node: unknown, path: string, depth: number) => {
        if (results.length >= maximum || depth > 14 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            if (node.length) visit(node[0], `${path}[]`, depth + 1);
            return;
        }
        const record = node as Record<string, unknown>;
        const keys = Object.keys(record);
        if (keys.some((key) => relevant.test(key))) {
            const samples: Record<string, string | number | boolean | null> = {};
            for (const [key, field] of Object.entries(record)) {
                const value = scalar(field);
                if (value !== undefined && /^(id|type|title|name|status|url|username|displayName|componentType)$/i.test(key)) samples[key] = value;
            }
            results.push({ path, keys: keys.slice(0, 40).sort(), samples });
        }
        for (const [key, child] of Object.entries(record)) visit(child, `${path}.${key}`, depth + 1);
    };
    visit(value, '$', 0);
    return results;
}

/** Gives an intentionally small field map for the proven eBay Live feed node. */
export function inspectLiveFeedShapes(value: unknown): GraphqlFeedShape[] {
    const shapes: GraphqlFeedShape[] = [];
    const scalar = (value: unknown): string | number | boolean | null | undefined => {
        if (typeof value === 'string') return value.slice(0, 120);
        if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
        return undefined;
    };
    const summarize = (node: unknown, path: string, depth: number, fields: GraphqlFeedShape['fields']) => {
        if (depth > 5 || fields.length >= 30 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) { if (node.length) summarize(node[0], `${path}[]`, depth + 1, fields); return; }
        const record = node as Record<string, unknown>; const samples: Record<string, string | number | boolean | null> = {};
        for (const [key, value] of Object.entries(record)) { const sample = scalar(value); if (sample !== undefined) samples[key] = sample; }
        fields.push({ path, keys: Object.keys(record).sort().slice(0, 50), samples });
        for (const [key, child] of Object.entries(record)) summarize(child, `${path}.${key}`, depth + 1, fields);
    };
    const visit = (node: unknown, path: string, depth: number) => {
        if (depth > 14 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach((item, index) => { if (index < 3) visit(item, `${path}[]`, depth + 1); }); return; }
        const record = node as Record<string, unknown>;
        if (record.feedCollectionStreamV2 && typeof record.feedCollectionStreamV2 === 'object') {
            const fields: GraphqlFeedShape['fields'] = []; summarize(record.feedCollectionStreamV2, `${path}.feedCollectionStreamV2`, 0, fields); shapes.push({ path, fields });
        }
        for (const [key, child] of Object.entries(record)) visit(child, `${path}.${key}`, depth + 1);
    };
    visit(value, '$', 0);
    return shapes.slice(0, 10);
}

/** Bounded public host/sellerProfile field map from eBay Live feed cards. */
export function inspectSellerProfileShapes(value: unknown): SellerProfileShape[] {
    const results: SellerProfileShape[] = [];
    const scalarSamples = (record: Record<string, unknown>) => Object.fromEntries(
        Object.entries(record)
            .filter(([, field]) => field === null || ['string', 'number', 'boolean'].includes(typeof field))
            .slice(0, 40)
            .map(([key, field]) => [key, typeof field === 'string' ? field.slice(0, 120) : field as number | boolean | null]),
    );
    const visit = (node: unknown, depth: number) => {
        if (depth > 16 || results.length >= 20 || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.slice(0, 10).forEach((item) => visit(item, depth + 1)); return; }
        const record = node as Record<string, unknown>;
        if (record.__typename === 'LiveEvent' && Array.isArray(record.hosts)) {
            for (const rawHost of record.hosts.slice(0, 5)) {
                if (!rawHost || typeof rawHost !== 'object') continue;
                const host = rawHost as Record<string, unknown>;
                const profile = host.sellerProfile && typeof host.sellerProfile === 'object'
                    ? host.sellerProfile as Record<string, unknown> : {};
                results.push({
                    host_keys: Object.keys(host).sort(),
                    host_samples: scalarSamples(host),
                    profile_keys: Object.keys(profile).sort(),
                    profile_samples: scalarSamples(profile),
                });
            }
        }
        Object.values(record).forEach((child) => visit(child, depth + 1));
    };
    visit(value, 0);
    return results;
}
