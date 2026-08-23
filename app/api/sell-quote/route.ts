import { NextRequest, NextResponse } from 'next/server';
import { generateJWT } from '../../utils/sessionTokenApi';
import { logger } from '../../utils/logger';

// Types for sell quote request
// Based on CDP API documentation: https://docs.cdp.coinbase.com/api-reference/rest-api/onramp-offramp/create-sell-quote
//
// IMPORTANT REQUIREMENT: Users MUST have a Coinbase account with linked bank details
// Guest checkout is NOT supported for fiat withdrawals/offramp transactions
// The user must:
//   1. Have an active Coinbase account (coinbase.com)
//   2. Complete identity verification
//   3. Link their bank account, PayPal, or other payment method
//   4. Have the crypto assets in their wallet on the specified network
interface SellQuoteRequest {
  sellCurrency: string;        // Ticker symbol (e.g., 'BTC', 'USDC', 'ETH')
  sellAmount: string;           // Amount to sell (e.g., '10')
  sellNetwork: string;          // Network name (e.g., 'ethereum', 'base', 'polygon')
  cashoutCurrency: string;      // Fiat currency (e.g., 'USD', 'EUR')
  paymentMethod: string;        // Payment method ID - Available options per CDP docs:
                                // - ACH_BANK_ACCOUNT: US bank transfer (1-3 business days)
                                // - RTP: Real-Time Payments (US only, instant)
                                // - PAYPAL: PayPal transfer
                                // - FIAT_WALLET: Coinbase fiat wallet (instant)
                                // - SEPA_BANK_ACCOUNT: SEPA bank transfer (Europe)
                                // - CARD: Debit/credit card (select countries)
                                // - APPLE_PAY: Apple Pay (select countries)
  country: string;              // ISO 3166-1 two-letter country code (e.g., 'US')
  subdivision?: string;         // ISO 3166-2 state code (e.g., 'CA', 'NY') - Required for US
  sourceAddress: string;        // Source wallet address - Required for One-Click-Sell URL
  redirectUrl: string;          // Redirect URL after transaction - Required for One-Click-Sell URL
  partnerUserId: string;        // Unique user identifier (max 50 chars) - Required for One-Click-Sell URL
  
  // Note: When sourceAddress, redirectUrl, and partnerUserId are included,
  // the Sell Quote API returns a ready-to-use One-Click-Sell offramp URL
  // with all parameters (sessionToken, defaultAsset, presetFiatAmount, quoteId, etc.)
  // already set in the URL. See: https://docs.cdp.coinbase.com/onramp-&-offramp/offramp-apis/one-click-sell-url
}

export async function POST(request: NextRequest) {
  try {
    // Get API credentials from environment variables
    const keyName = process.env.CDP_API_KEY || process.env.CDP_API_KEY_NAME;
    const keySecret = process.env.CDP_API_SECRET || process.env.CDP_API_KEY_PRIVATE_KEY;

    if (!keyName || !keySecret) {
      logger.error('Missing CDP API credentials');
      return NextResponse.json(
        {
          error: 'Server configuration error',
        },
        { status: 500 }
      );
    }

    // Parse request body
    const body: Record<string, any> = await request.json();

    // ── Request method (HTTP verb) is an input parameter ─────────────────
    const method = (body.method || 'POST').toUpperCase();

    if (!['POST', 'GET'].includes(method)) {
      return NextResponse.json(
        { error: `Unsupported request method: ${method}. Supported: POST, GET` },
        { status: 400 }
      );
    }

    // Two payload shapes are supported:
    //   1. Simple snake_case quote (matching cdp docs / cdpcurl) e.g.
    //      { "sell_currency":"USDC","sell_amount":"100","cashout_currency":"USD",
    //        "payment_method":"ACH_BANK_ACCOUNT","country":"US","subdivision":"NY" }
    //   2. Legacy camelCase one-click-sell payload (requires sourceAddress,
    //      redirectUrl and partnerUserId to return an offramp_url)
    const isSimple = typeof body.sell_currency === 'string';

    const {
      sellCurrency,
      sellAmount,
      sellNetwork,
      cashoutCurrency,
      paymentMethod,
      country,
      subdivision,
      sourceAddress,
      redirectUrl,
      partnerUserId,
    } = body;

    // Resolve snake_case first, then fall back to camelCase
    const resolvedSellCurrency = body.sell_currency ?? sellCurrency;
    const resolvedSellAmount = body.sell_amount ?? sellAmount;
    const resolvedSellNetwork = body.sell_network ?? sellNetwork;
    const resolvedCashoutCurrency = body.cashout_currency ?? cashoutCurrency;
    const resolvedPaymentMethod = body.payment_method ?? paymentMethod;

    // Validate required fields
    const missingFields: string[] = [];
    if (!resolvedSellCurrency) missingFields.push('sellCurrency');
    if (!resolvedSellAmount) missingFields.push('sellAmount');
    if (!resolvedCashoutCurrency) missingFields.push('cashoutCurrency');
    if (!resolvedPaymentMethod) missingFields.push('paymentMethod');
    if (!country) missingFields.push('country');

    // Legacy one-click-sell flow additionally requires these
    if (!isSimple && (!sourceAddress || !redirectUrl || !partnerUserId)) {
      missingFields.push('sourceAddress', 'redirectUrl', 'partnerUserId');
    }

    if (missingFields.length) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          required: missingFields,
        },
        { status: 400 }
      );
    }

    // Extract client IP
    let clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.ip;

    // Check if IP is private or localhost and use a public test IP for development
    const isPrivateIp = !clientIp ||
      clientIp === '127.0.0.1' ||
      clientIp === 'localhost' ||
      clientIp === '::1' ||
      clientIp.startsWith('10.') ||
      clientIp.startsWith('192.168.') ||
      clientIp.startsWith('172.16.') ||
      clientIp.startsWith('172.17.') ||
      clientIp.startsWith('172.18.') ||
      clientIp.startsWith('172.19.') ||
      clientIp.startsWith('172.20.') ||
      clientIp.startsWith('172.21.') ||
      clientIp.startsWith('172.22.') ||
      clientIp.startsWith('172.23.') ||
      clientIp.startsWith('172.24.') ||
      clientIp.startsWith('172.25.') ||
      clientIp.startsWith('172.26.') ||
      clientIp.startsWith('172.27.') ||
      clientIp.startsWith('172.28.') ||
      clientIp.startsWith('172.29.') ||
      clientIp.startsWith('172.30.') ||
      clientIp.startsWith('172.31.');

    if (isPrivateIp) {
      // Use a valid public test IP for development (example IP from documentation RFC 5737)
      clientIp = '192.0.2.1';
      logger.debug('Using test public IP for development', { originalIp: request.ip });
    }

    // Prepare request to Coinbase Sell Quote API
    const cdpApiUrl = 'https://api.developer.coinbase.com/onramp/v1/sell/quote';
    const apiPath = '/onramp/v1/sell/quote';

    // Generate JWT for authentication with the correct request path + method
    // IMPORTANT: The JWT must be generated with the exact API path it will be used for
    // because the request path is included in the JWT signature for security
    let jwtToken: string;
    try {
      jwtToken = await generateJWT(keyName, keySecret, apiPath, method);
      logger.debug('JWT generated successfully for sell quote endpoint', { method });
    } catch (error) {
      logger.error('JWT generation failed', { error });

      return NextResponse.json(
        {
          error: 'Authentication failed',
        },
        { status: 500 }
      );
    }

    // Build the outgoing request body to Coinbase (snake_case per cdpcurl/docs).
    // For the simple quote, only include the supplied fields so optional
    // one-click-sell URL params are omitted when not provided.
    const requestBody: any = {
      sell_currency: resolvedSellCurrency,
      sell_amount: resolvedSellAmount,
      cashout_currency: resolvedCashoutCurrency,
      payment_method: resolvedPaymentMethod,
      country,
      ...(resolvedSellNetwork ? { sell_network: resolvedSellNetwork } : {}),
      ...(subdivision ? { subdivision } : {}),
    };

    // Legacy one-click-sell flow: include source address + redirect params
    if (!isSimple) {
      requestBody.source_address = sourceAddress;
      requestBody.redirect_url = redirectUrl;
      requestBody.partner_user_id = partnerUserId;
      requestBody.clientIp = clientIp;
    }

    logger.debug('Making request to CDP Sell Quote API', {
      method,
      sellCurrency: resolvedSellCurrency,
      sellAmount: resolvedSellAmount,
      cashoutCurrency: resolvedCashoutCurrency,
      paymentMethod: resolvedPaymentMethod,
      country,
      isSimple,
    });

    // Make request to Coinbase API using the requested method
    const isGet = method === 'GET';
    const response = await fetch(cdpApiUrl, {
      method,
      headers: {
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        'Accept': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
      },
      body: isGet ? undefined : JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error('CDP Sell Quote API error', {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText
      });

      // Parse error response to get more details
      let errorDetails = responseText;
      try {
        const errorData = JSON.parse(responseText);
        errorDetails = errorData.message || errorData.error || responseText;
      } catch (e) {
        // If parsing fails, use raw text
      }

      console.error('Sell Quote API failed:', {
        status: response.status,
        error: errorDetails,
        requestParams: {
          sellCurrency,
          sellAmount,
          cashoutCurrency,
          paymentMethod,
          country,
        }
      });

      // In development, return more details
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json(
          {
            error: 'Failed to generate sell quote',
            details: errorDetails,
            status: response.status,
            hint: response.status === 401 ? 'Check your CDP API credentials in .env.local' : undefined
          },
          { status: response.status }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to generate sell quote',
          details: response.status === 401 ? 'Authentication failed - check API credentials' : undefined
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
        {
          error: 'Invalid response from server',
        },
        { status: 500 }
      );
    }

    logger.info('Sell quote generated successfully', {
      hasOfframpUrl: !!data.offramp_url,
      quoteId: data.quote_id,
    });

    // The response includes a ready-to-use One-Click-Sell offramp URL
    // The URL contains all necessary parameters:
    // - sessionToken: Generated automatically by Coinbase
    // - partnerUserId: From our request
    // - redirectUrl: From our request
    // - defaultAsset: From sellCurrency in our request
    // - presetFiatAmount or presetCryptoAmount: From sellAmount
    // - quoteId: Generated by Coinbase for this quote
    // - defaultCashoutMethod: From paymentMethod in our request (if supported)
    // See: https://docs.cdp.coinbase.com/onramp-&-offramp/offramp-apis/one-click-sell-url
    
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error generating sell quote', { error });
    return NextResponse.json(
      {
        error: 'Failed to generate sell quote',
      },
      { status: 500 }
    );
  }
}
