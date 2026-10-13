import { describe, expect, it } from 'vitest';
import { captureGraphqlResponse } from '../src/graphql.js';

describe('GraphQL capture', () => {
    it('keeps operation metadata and a public response body', async () => {
        const capture = await captureGraphqlResponse({
            url: () => 'https://www.ebay.com/d/graphql',
            request: () => ({ postData: () => JSON.stringify({ operationName: 'LiveEvents', variables: { country: 'US' } }) }),
            text: async () => JSON.stringify({ data: { liveEvents: [] } }),
        } as never);
        expect(capture).toMatchObject({ operation_name: 'LiveEvents', variable_keys: ['country'] });
    });
});
