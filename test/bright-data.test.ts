import { describe, expect, it } from 'vitest';

import { fetchWithWebUnlocker, htmlToVisibleText } from '../src/bright-data.js';

describe('Bright Data Web Unlocker client', () => {
    it('requests rendered public HTML and unwraps the response body', async () => {
        let capturedInit: RequestInit | undefined;
        const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            capturedInit = init;
            return new Response(JSON.stringify({ status_code: 200, body: '<h1>Seller</h1>' }), { status: 200 });
        }) as typeof fetch;
        const result = await fetchWithWebUnlocker('https://www.ebay.com/usr/seller', {
            apiKey: 'secret', zone: 'web_unlocker1', country: 'US', timeoutMillis: 10_000,
        }, fetcher as typeof fetch);
        expect(result.html).toBe('<h1>Seller</h1>');
        const request = JSON.parse(String(capturedInit?.body));
        expect(request).toMatchObject({ zone: 'web_unlocker1', country: 'us', render: 'true' });
    });

    it('converts returned HTML to visible profile text', () => {
        expect(htmlToVisibleText('<style>x</style><div>99.9% positive &amp; trusted</div>')).toBe('99.9% positive & trusted');
    });
});
