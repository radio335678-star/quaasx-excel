module.exports = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Signal to the frontend whether server-side API key is configured
  // We NEVER expose the actual key — just a boolean flag so the UI
  // knows it can call /api/generate-sheet without a client-side key.
  const hasServerApiKey = !!(
    process.env.NVIDIA_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    process.env.QUAASX_API_KEY
  );

  // Detect which provider is configured so the UI shows the right label
  let serverProvider = null;
  if (process.env.NVIDIA_API_KEY) serverProvider = 'nvidia';
  else if (process.env.MOONSHOT_API_KEY || process.env.QUAASX_API_KEY) serverProvider = 'moonshot';

  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    hasServerApiKey,
    serverProvider
  });
};
