const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ASANA_TOKEN = process.env.ASANA_TOKEN;
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID;

async function callClaude(userMessage) {
  const today = new Date().toISOString().split("T")[0];
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `You are a personal assistant that parses quick notes into structured tasks.
Today's date is ${today}.
Given a note, return ONLY a JSON object with these fields:
- title: concise task title (required)
- notes: any extra context or details (string or null)
- due_on: due date in YYYY-MM-DD format (or null if not mentioned). Resolve relative dates like "tomorrow" or "Friday" using today's date.
- priority: "high", "medium", or "low" (infer from urgency words, default "medium")
- assignee_name: first name or full name of the person to assign to (or null if not mentioned)
- destination: "asana" or "note" (use "asana" unless clearly just a memo)
No preamble, no markdown fences, just the raw JSON object.`,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await response.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

async function findAsanaUser(name) {
  if (!name) return null;
  const response = await fetch(
    `https://app.asana.com/api/1.0/workspaces/${ASANA_WORKSPACE_ID}/users?opt_fields=name,email`,
    { headers: { Authorization: `Bearer ${ASANA_TOKEN}` } }
  );
  const data = await response.json();
  const users = data.data || [];
  const lower = name.toLowerCase();
  const match = users.find((u) => u.name.toLowerCase().includes(lower));
  return match ? match.gid : null;
}

async function createAsanaTask(parsed) {
  const assigneeGid = await findAsanaUser(parsed.assignee_name);
  const body = {
    data: {
      name: parsed.title,
      workspace: ASANA_WORKSPACE_ID,
      notes: parsed.notes || "",
      ...(parsed.due_on && { due_on: parsed.due_on }),
      ...(assigneeGid && { assignee: assigneeGid }),
    },
  };
  const response = await fetch("https://app.asana.com/api/1.0/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ASANA_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  console.log("Asana response:", JSON.stringify(data));
  return { task: data.data, assigneeGid, assigneeName: parsed.assignee_name };
}

async function sendTelegram(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const { message } = req.body || {};
  if (!message || !message.text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === "/start") {
    await sendTelegram(chatId, "👋 *Personal Assistant ready!*\n\nJust send me any note and I'll parse it and create a task in Asana.\n\nExamples:\n• _Call Marek tomorrow about the proposal_\n• _Review Q2 report before Friday_\n• _Agenda for client visit, assign to Vladimiro_");
    return res.status(200).json({ ok: true });
  }

  await sendTelegram(chatId, "⏳ Parsing your note...");

  try {
    const parsed = await callClaude(text);
    if (!parsed) throw new Error("Could not parse note");

    let reply = "";

    if (parsed.destination === "asana") {
      const { task, assigneeGid, assigneeName } = await createAsanaTask(parsed);

      if (!task || !task.gid) {
        throw new Error("Asana did not return a valid task. Check your ASANA_TOKEN and ASANA_WORKSPACE_ID.");
      }

      const dueStr = parsed.due_on ? `\n📅 Due: ${parsed.due_on}` : "";
      const priorityEmoji = parsed.priority === "high" ? "🔴" : parsed.priority === "low" ? "🟢" : "🟡";
      const assigneeStr = assigneeGid ? `\n👤 Assigned to ${assigneeName}` : (parsed.assignee_name ? `\n⚠️ Could not find user "${parsed.assignee_name}" in Asana` : "");
      reply = `✅ *Task created in Asana*\n\n${priorityEmoji} *${parsed.title}*${dueStr}${assigneeStr}${parsed.notes ? `\n📝 ${parsed.notes}` : ""}\n\n[Open in Asana](https://app.asana.com/0/0/${task.gid})`;
    } else {
      reply = `📝 *Note saved*\n\n_${parsed.title}_${parsed.notes ? `\n${parsed.notes}` : ""}`;
    }

    await sendTelegram(chatId, reply);
  } catch (err) {
    console.error("Handler error:", err.message);
    await sendTelegram(chatId, `❌ Error: ${err.message}`);
  }

  return res.status(200).json({ ok: true });
}
