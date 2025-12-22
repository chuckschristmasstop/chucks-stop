import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create the client if keys are present, otherwise export a dummy/null
// or handle it so the app doesn't crash on import.
export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : {
        from: () => ({ select: () => ({ data: [], error: null }), insert: () => ({ error: null }), on: () => ({ subscribe: () => { } }) }),
        channel: () => ({ on: () => ({ subscribe: () => { } }) })
    };
