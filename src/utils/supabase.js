import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if environment variables are missing
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables!");
  console.error("Please create a .env.local file with:");
  console.error("VITE_SUPABASE_URL=your_supabase_url");
  console.error("VITE_SUPABASE_ANON_KEY=your_supabase_anon_key");
}

// Create client with fallback empty strings if env vars are missing
// This prevents the app from crashing, but API calls will fail
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-key"
);

// Export a flag to check if Supabase is properly configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

