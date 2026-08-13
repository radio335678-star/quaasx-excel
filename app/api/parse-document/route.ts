import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export async function POST(request: NextRequest) {
  try {
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File content is empty' }, { status: 400 });
    }

    const result = await mammoth.extractRawText({ buffer });
    return NextResponse.json({ text: result.value });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to parse Word document: ' + err.message }, { status: 500 });
  }
}
