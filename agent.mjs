import { supabase } from "./supabase-client.mjs";

if (!supabase) throw new Error("Configure SUPABASE_URL and SUPABASE_ANON_KEY first.");
console.log("JARVIS remote agent ready. Sign in through the dashboard before sending commands.");
console.log("Command execution remains approval-gated; this process does not execute arbitrary remote shell commands.");
