import { NextResponse } from 'next/server';

export async function GET() {
  const hasServerApiKey = !!(
    process.env.NVIDIA_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.QUAASX_API_KEY
  );

  let serverProvider: string | null = null;
  if (process.env.NVIDIA_API_KEY) serverProvider = 'nvidia';
  else if (process.env.MOONSHOT_API_KEY || process.env.QUAASX_API_KEY) serverProvider = 'moonshot';

  return NextResponse.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    hasServerApiKey,
    serverProvider
  });
}
