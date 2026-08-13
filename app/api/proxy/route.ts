import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const targetUrl = payload.url;
    const headers = payload.headers || {};

    let authHeader = headers['Authorization'];
    if (!authHeader || authHeader === 'Bearer ' || authHeader === 'Bearer null' || authHeader === 'Bearer undefined') {
      const serverKey = process.env.NVIDIA_API_KEY || process.env.MOONSHOT_API_KEY || process.env.QUAASX_API_KEY;
      if (serverKey) {
        headers['Authorization'] = 'Bearer ' + serverKey;
      }
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(payload.body),
    });

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Proxy request failed: ' + err.message }, { status: 500 });
  }
}
