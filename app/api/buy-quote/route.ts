import { NextRequest, NextResponse } from 'next/server';
import { generateJWT } from '../../utils/sessionTokenApi';
import { logger } from '../../utils/logger';

/**
 * POST /api/buy-quote
 *
 * Proxies a request to the Coinbase CDP Buy Quote API:
 *   https://api.developer.coinbase.com/onramp/v1/buy/quote
 *
 * The HTTP method used to call the CDP API is supplied by the client as part of
 * the request body (`method`), defaulting to `POST`. The JWT is signed with the
 * same path + method so the upstream call authenticates correctly.
 *
 * CDP API Docs: https://docs.cdp.coinbase.com/api-reference/rest-api/onramp-offramp/create-buy-quote
 */
export async function POST(request: NextRequest) {
  try {
    // Get API credentials from environment variables
    const keyName = process.env.CDP_API_KEY || process.env.CDP_API_KEY_NAME;
    const keySecret = process.env.CDP_API_SECRET || process.env.CDP_API_KEY_PRIVATE_KEY;

    if (!keyName || !keySecret) {
      logger.error('Missing CDP API credentials');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();

    // ── Request method (HTTP verb) is an input parameter ─────────────────
    // Extract the desired upstream method, then strip it from the payload so it
    // is not forwarded to the Coinbase Buy Quote API.
    const method = (body.method || 'POST').toUpperCase();
    const { method: _method, ...quoteParams } = body;

    // Accept snake_case keys matching the Coinbase Buy Quote API payload
    const {
      purchase_currency: purchaseCurrency,
      purchase_network: purchaseNetwork,
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      payment_method: paymentMethod,
      country,
      subdivision,
    } = quoteParams;

    // Validate required fields
    if (
      !purchaseCurrency ||
      !purchaseNetwork ||
      !paymentAmount ||
      !paymentCurrency ||
      !paymentMethod ||
      !country
    ) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: [
            'purchase_currency',
            'purchase_network',
            'payment_amount',
            'payment_currency',
            'payment_method',
            'country',
          ],
        },
        { status: 400 }
      );
    }

    if (!['POST', 'GET'].includes(method)) {
      return NextResponse.json(
        { error: `Unsupported request method: ${method}. Supported: POST, GET` },
        { status: 400 }
      );
    }

    // CDP Buy Quote endpoint
    const cdpApiUrl = 'https://api.developer.coinbase.com/onramp/v1/buy/quote';
    const apiPath = '/onramp/v1/buy/quote';

    // Generate JWT for authentication with the exact path + method
    let jwtToken: string;
    try {
      jwtToken = await generateJWT(keyName, keySecret, apiPath, method);
      logger.debug('JWT generated successfully for buy quote endpoint', {
        method,
        apiPath,
      });
    } catch (error) {
      logger.error('JWT generation failed', { error });
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      );
    }

    const requestBody: any = {
      purchase_currency: purchaseCurrency,
      purchase_network: purchaseNetwork,
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      payment_method: paymentMethod,
      country,
    };

    // Add optional fields
    if (subdivision) {
      requestBody.subdivision = subdivision;
    }

    logger.debug('Making request to CDP Buy Quote API', {
      method,
      purchaseCurrency,
      purchaseNetwork,
      paymentCurrency,
      paymentMethod,
      country,
    });

    // Make request to Coinbase API using the requested method
    const isGet = method === 'GET';
    const response = await fetch(cdpApiUrl, {
      method,
      headers: {
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        Accept: 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: isGet ? undefined : JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error('CDP Buy Quote API error', {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText,
      });

      let errorDetails = responseText;
      try {
        const errorData = JSON.parse(responseText);
        errorDetails = errorData.message || errorData.error || responseText;
      } catch (e) {
        // If parsing fails, use raw text
      }

      // In development, return more details
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(
          {
            error: 'Failed to generate buy quote',
            details: errorDetails,
            status: response.status,
            hint:
              response.status === 401
                ? 'Check your CDP API credentials in .env.local'
                : undefined,
          },
          { status: response.status }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to generate buy quote',
          details:
            response.status === 401
              ? 'Authentication failed - check API credentials'
              : undefined,
        },
        { status: response.status }
      );
    }

    // Parse successful response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      logger.error('Failed to parse CDP API response', { error });
      return NextResponse.json(
        { error: 'Invalid response from server' },
        { status: 500 }
      );
    }

    logger.info('Buy quote generated successfully', {
      quoteId: data.quote_id,
    });

    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error generating buy quote', { error });
    return NextResponse.json(
      { error: 'Failed to generate buy quote' },
      { status: 500 }
    );
  }
}