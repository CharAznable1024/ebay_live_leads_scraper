export interface WebUnlockerOptions {
    apiKey: string;
    zone: string;
    country: string;
    timeoutMillis: number;
}

export interface WebUnlockerResult {
    html: string;
    status_code: number;
    content_type: string | null;
    bright_data_error: string | null;
}

type Fetch = typeof fetch;

/** Fetches one public page through Bright Data Web Unlocker REST API. */
export async function fetchWithWebUnlocker(
    targetUrl: string,
    options: WebUnlockerOptions,
    fetcher: Fetch = fetch,
): Promise<WebUnlockerResult> {
    const response = await fetcher('https://api.brightdata.com/request', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            zone: options.zone,
            url: targetUrl,
            format: 'raw',
            country: options.country.toLowerCase(),
            render: 'true',
        }),
        signal: AbortSignal.timeout(options.timeoutMillis),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`Web Unlocker returned HTTP ${response.status}: ${responseText.slice(0, 300)}`);

    try {
        const envelope = JSON.parse(responseText) as { body?: unknown; status_code?: unknown };
        if (typeof envelope.body === 'string') {
            return {
                html: envelope.body,
                status_code: typeof envelope.status_code === 'number' ? envelope.status_code : response.status,
                content_type: response.headers.get('content-type'),
                bright_data_error: response.headers.get('x-brd-error'),
            };
        }
    } catch {
        // Native raw format returns the target HTML directly.
    }
    return {
        html: responseText,
        status_code: response.status,
        content_type: response.headers.get('content-type'),
        bright_data_error: response.headers.get('x-brd-error'),
    };
}

export function htmlToVisibleText(html: string): string {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export function inspectUnlockedHtml(html: string, sellerUsername: string, metadata?: Partial<WebUnlockerResult>) {
    const visibleText = htmlToVisibleText(html);
    return {
        html_bytes: Buffer.byteLength(html),
        status_code: metadata?.status_code ?? null,
        content_type: metadata?.content_type ?? null,
        bright_data_error: metadata?.bright_data_error ?? null,
        title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
        contains_seller_username: visibleText.toLowerCase().includes(sellerUsername.toLowerCase()),
        contains_captcha_or_error: /captcha|robot|something went wrong|access denied|verify you are human/i.test(visibleText),
        text_preview: visibleText.slice(0, 800),
    };
}
