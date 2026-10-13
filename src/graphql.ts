import type { Response } from 'playwright';

export interface GraphqlCapture {
    operation_name: string | null;
    variable_keys: string[];
    response: unknown;
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
