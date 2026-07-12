import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = (process.env.JARVIS_OWNER_EMAIL || "sirajsayed7@gmail.com").toLowerCase();
const localCore = process.env.JARVIS_LOCAL_URL || "http://127.0.0.1:5190";
if (!url || !serviceKey) throw new Error("Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the laptop agent.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function processCommand(command) {
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(command.user_id);
  if (userError || (userData.user?.email || "").toLowerCase() !== ownerEmail) return;

  const { data: claimed } = await supabase.from("jarvis_commands")
    .update({ status: "running" }).eq("id", command.id).eq("status", "queued").select("id").maybeSingle();
  if (!claimed) return;

  try {
    const response = await fetch(`${localCore}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: command.command })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Local core failed (${response.status}).`);
    await supabase.from("jarvis_commands").update({ status: "completed", result: body.answer, completed_at: new Date().toISOString() }).eq("id", command.id);
  } catch (error) {
    await supabase.from("jarvis_commands").update({ status: "failed", result: error.message, completed_at: new Date().toISOString() }).eq("id", command.id);
  }
}

const { data: pending } = await supabase.from("jarvis_commands").select("*").eq("status", "queued").order("created_at");
for (const command of pending || []) processCommand(command);

supabase.channel("jarvis-laptop-agent")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_commands" }, payload => processCommand(payload.new))
  .subscribe(status => console.log(`JARVIS remote agent: ${status}`));

console.log(`JARVIS laptop agent active for ${ownerEmail}.`);
