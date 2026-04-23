
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,        // ✅ garde la session
      autoRefreshToken: true,      // ✅ évite les déconnexions silencieuses
      detectSessionInUrl: true,    // ✅ CRUCIAL pour OAuth
    },
  }
)