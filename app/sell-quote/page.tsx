"use client";

import Header from "../components/Header";
import { Footer } from "../components/Footer";
import { useState } from "react";

interface SellQuoteResponse {
  quote_id?: string;
  [key: string]: unknown;
}

const NETWORKS: Record<string, string> = {
  USDC: "base",
  ETH: "base",
  BTC: "bitcoin",
  SOL: "solana",
};

const FIELD_STYLE = "w-full p-2 border rounded-md";

/**
 * Pretty-print an API response as indented JSON.
 * Falls back to the raw text if it is not valid JSON.
 */
function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export default function SellQuotePage() {
  const [method, setMethod] = useState("POST");
  const [sellCurrency, setSellCurrency] = useState("USDC");
  const [sellNetwork, setSellNetwork] = useState("base");
  const [sellAmount, setSellAmount] = useState("100.00");
  const [cashoutCurrency, setCashoutCurrency] = useState("USD");
  const [paymentMethod, setPaymentMethod] = useState("ACH_BANK_ACCOUNT");
  const [country, setCountry] = useState("US");
  const [subdivision, setSubdivision] = useState("NY");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<SellQuoteResponse | null>(null);
  const [rawResponse, setRawResponse] = useState("");

  const handleSellCurrencyChange = (value: string) => {
    setSellCurrency(value);
    if (NETWORKS[value]) {
      setSellNetwork(NETWORKS[value]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setQuote(null);
    setRawResponse("");

    try {
      const response = await fetch("/api/sell-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method, // ← Request method as an input parameter
          sell_currency: sellCurrency,
          sell_network: sellNetwork,
          sell_amount: sellAmount,
          cashout_currency: cashoutCurrency,
          payment_method: paymentMethod,
          country,
          subdivision,
        }),
      });

      const text = await response.text();
      setRawResponse(text);

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const data = JSON.parse(text);
          message = data.error || message;
        } catch {
          // keep default message
        }
        throw new Error(message);
      }

      let data: SellQuoteResponse;
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }
      setQuote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Sell Quote API</h1>
          <p className="text-gray-600 mb-6">
            Generate a quote for selling cryptocurrency for fiat via the
            Coinbase CDP{" "}
            <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">
              /onramp/v1/sell/quote
            </code>{" "}
            endpoint. The request method is an input parameter.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* ── Request form ── */}
            <div className="p-5 bg-white border border-gray-200 rounded-lg shadow-md">
              <h2 className="text-xl font-bold mb-4">Request</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Request Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className={FIELD_STYLE}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    HTTP method used to call the CDP Sell Quote API (JWT is
                    signed for this method).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sell Currency
                    </label>
                    <input
                      list="cryptoOptions"
                      type="text"
                      value={sellCurrency}
                      onChange={(e) => handleSellCurrencyChange(e.target.value)}
                      className={FIELD_STYLE}
                    />
                    <datalist id="cryptoOptions">
                      <option value="USDC" />
                      <option value="ETH" />
                      <option value="BTC" />
                      <option value="SOL" />
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sell Network
                    </label>
                    <input
                      type="text"
                      value={sellNetwork}
                      onChange={(e) => setSellNetwork(e.target.value)}
                      className={FIELD_STYLE}
                      placeholder="base"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sell Amount
                    </label>
                    <input
                      type="text"
                      value={sellAmount}
                      onChange={(e) => setSellAmount(e.target.value)}
                      className={FIELD_STYLE}
                      placeholder="100.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cashout Currency
                    </label>
                    <input
                      type="text"
                      value={cashoutCurrency}
                      onChange={(e) => setCashoutCurrency(e.target.value)}
                      className={FIELD_STYLE}
                      placeholder="USD"
                    />
                  </div>
                </div>
<div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className={FIELD_STYLE}
                  >
                    <option value="ACH_BANK_ACCOUNT">ACH Bank Account</option>
                    <option value="RTP">RTP (Real-Time Payments)</option>
                    <option value="PAYPAL">PayPal</option>
                    <option value="FIAT_WALLET">Fiat Wallet</option>
                    <option value="SEPA_BANK_ACCOUNT">SEPA Bank Account</option>
                    <option value="CARD">Debit/Credit Card</option>
                    <option value="APPLE_PAY">Apple Pay</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className={FIELD_STYLE}
                      placeholder="US"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subdivision (state)
                    </label>
                    <input
                      type="text"
                      value={subdivision}
                      onChange={(e) => setSubdivision(e.target.value)}
                      className={FIELD_STYLE}
                      placeholder="NY (required for US)"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
                    isLoading
                      ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700 text-white"
                  }`}
                >
                  {isLoading
                    ? "Fetching quote..."
                    : `Get Quote (${method})`}
                </button>
              </form>
            </div>
{/* ── Response ── */}
            <div className="p-5 bg-white border border-gray-200 rounded-lg shadow-md">
              <h2 className="text-xl font-bold mb-4">Response</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {quote && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">
                    Quote generated successfully
                  </p>
                  {quote.quote_id && (
                    <p className="text-sm mt-1">
                      Quote ID:{" "}
                      <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                        {quote.quote_id}
                      </code>
                    </p>
                  )}
                </div>
              )}

              <pre className="p-4 bg-gray-900 text-gray-200 rounded-lg overflow-auto text-xs leading-relaxed font-mono">
                {rawResponse
                  ? formatJson(rawResponse)
                  : isLoading
                  ? "Requesting quote..."
                  : "// Response will appear here"}
              </pre>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-bold mb-2">Notes</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>
                    Set <code>CDP_API_KEY</code> and{" "}
                    <code>CDP_API_SECRET</code> in your environment variables.
                  </li>
                  <li>
                    The request method (POST/GET) is passed to the Coinbase API
                    and used to sign the JWT.
                  </li>
                  <li>
                    Users need a Coinbase account with linked bank details to
                    complete the offramp.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}