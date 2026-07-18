export default function handler(_request, response) {
  response.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    ownerEmail: process.env.JARVIS_OWNER_EMAIL || 'sirajsayed7@gmail.com',
    hostedChat: Boolean(process.env.GROQ_API_KEY),
    hostedVision: Boolean(process.env.GEMINI_API_KEY)
  });
}
