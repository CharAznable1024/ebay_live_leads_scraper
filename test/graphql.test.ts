import { describe, expect, it } from 'vitest';
import { captureGraphqlResponse, inspectGraphqlResponse, inspectLiveFeedShapes, inspectSellerProfileShapes } from '../src/graphql.js';

describe('GraphQL capture', () => {
    it('keeps operation metadata and a public response body', async () => {
        const capture = await captureGraphqlResponse({
            url: () => 'https://www.ebay.com/d/graphql',
            request: () => ({ postData: () => JSON.stringify({ operationName: 'LiveEvents', variables: { country: 'US' } }) }),
            text: async () => JSON.stringify({ data: { liveEvents: [] } }),
        } as never);
        expect(capture).toMatchObject({ operation_name: 'LiveEvents', variable_keys: ['country'] });
    });

    it('keeps only bounded structural signals for payload mapping', () => {
        const signals = inspectGraphqlResponse({ data: { feed: { liveEvent: { id: 'e1', host: { username: 'seller' } } } } });
        expect(signals.some((signal) => signal.path === '$.data.feed' && signal.keys.includes('liveEvent'))).toBe(true);
    });

    it('maps the proven feedCollectionStreamV2 branch without retaining full results', () => {
        const shapes = inspectLiveFeedShapes({ data: { module: { feedCollectionStreamV2: { feedCollection: { items: [{ title: 'Live' }] }, streamInfoV2: { status: 'LIVE' } } } } });
        expect(shapes[0].fields[0].keys).toEqual(expect.arrayContaining(['feedCollection', 'streamInfoV2']));
    });

    it('maps bounded sellerProfile fields from LiveEvent hosts', () => {
        const shapes = inspectSellerProfileShapes({ __typename: 'LiveEvent', hosts: [{ id: 'h1', userAccountName: 'seller', sellerProfile: { followers: 12, location: 'US' } }] });
        expect(shapes[0]).toMatchObject({ profile_keys: ['followers', 'location'], profile_samples: { followers: 12, location: 'US' } });
    });
});
