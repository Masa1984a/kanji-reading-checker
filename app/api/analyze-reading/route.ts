import { NextResponse } from 'next/server';
import { analyzeReading } from '@/lib/analyze-reading';
import { describeError } from '@/lib/api-error';
import { parseReadingRequest } from '@/lib/reading-request';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が正しくありません' },
      { status: 400 },
    );
  }

  const parsed = parseReadingRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await analyzeReading(parsed.input);
    return NextResponse.json(result);
  } catch (error) {
    console.error('analyze-reading failed:', error);
    const { status, error: message } = describeError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
