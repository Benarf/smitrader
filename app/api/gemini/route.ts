import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const { marketData, symbol, strategyType } = await req.json();

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
      You are an expert algorithmic trading system specialized in high-frequency microtrends for Deriv markets.
      Symbol: ${symbol}
      Strategy Type: ${strategyType}

      Market Data (last 50 data points):
      ${JSON.stringify(marketData)}

      Instructions:
      1. Identify microtrends: Look for short-term price momentum, reversal patterns, and volatility shifts.
      2. Analyze 1000+ microtrend variations: Consider combinations of moving averages, RSI, Bollinger Bands, and candlestick patterns in the context of high-frequency trading.
      3. Risk Management: Prioritize capital preservation. If the trend is unclear or volatility is too high without a clear direction, return "WAIT".
      4. "No loss" philosophy: Only signal trades with high probability (>0.8 confidence) and clear directional bias.
      5. Market Context: Note if it's a trend-following or mean-reversion opportunity.

      Response MUST be valid JSON:
      {
        "signal": "CALL" | "PUT" | "WAIT",
        "confidence": number (0 to 1),
        "reasoning": "A concise professional analysis of the microtrend and indicators justifying the signal",
        "risk_level": "LOW" | "MEDIUM" | "HIGH",
        "suggested_duration": number (optimal duration for this microtrend)
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response if Gemini adds markdown markers
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Failed to generate signal' }, { status: 500 });
  }
}
