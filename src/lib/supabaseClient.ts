import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = "https://cjrhxmfnmajxiwiiuwym.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcmh4bWZubWFqeGl3aWl1d3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTI2OTIsImV4cCI6MjA4ODk2ODY5Mn0.6q8_uL8wOmgX1jDyQ8qbENRrC7vJRCcD0CBtQAVPoHw";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
