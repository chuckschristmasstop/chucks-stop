import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://eqjokwluopfhvelpmyse.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxam9rd2x1b3BmaHZlbHBteXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjQ5NzksImV4cCI6MjA4MTkwMDk3OX0.GINzjLVXzo0fsMDcZtYE0SWxwfLxITRL3P-ZBfL6QSM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
