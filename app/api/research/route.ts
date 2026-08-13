import { NextRequest, NextResponse } from 'next/server';
const researchHandler = require('../../../api/research.js');

export async function POST(request: NextRequest) {
  return new Promise<NextResponse>((resolve) => {
    request.json().then((body) => {
      const mockReq: any = {
        method: 'POST',
        body,
        headers: Object.fromEntries(request.headers.entries()),
      };

      const mockRes: any = {
        statusCode: 200,
        headers: {},
        setHeader(key: string, value: string) {
          this.headers[key] = value;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          resolve(NextResponse.json(data, { status: this.statusCode, headers: this.headers }));
        },
        send(data: any) {
          resolve(new NextResponse(data, { status: this.statusCode, headers: this.headers }));
        },
        end(data: any) {
          resolve(new NextResponse(data || '', { status: this.statusCode, headers: this.headers }));
        },
      };

      researchHandler(mockReq, mockRes);
    }).catch((err) => {
      resolve(NextResponse.json({ error: 'Invalid JSON payload: ' + err.message }, { status: 400 }));
    });
  });
}
