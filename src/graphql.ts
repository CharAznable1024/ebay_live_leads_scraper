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
        if (results.length >= maximum || depth > 8 || !node || typeof node !== 'object') return;
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
