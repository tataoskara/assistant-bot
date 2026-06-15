const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ASANA_TOKEN = process.env.ASANA_TOKEN;
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID;

async function callClaude(userMessage) {
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
Given a note, return ONLY a JSON object with these fields:
- title: concise task title (required)
- notes: any extra context or details (string or null)
- due_on: due date in YYYY-MM-DD format (or null if not mentioned)
- priority: "high", "medium", or "low" (infer from urgency words, default "medium")
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

async function createAsanaTask(parsed) {
  const body = {
    data: {
      name: parsed.title,
      workspace: ASANA_WORKSPACE_ID,
      notes: parsed.notes || "",
      ...(parsed.due_on && { due_on: parsed.due_on }),
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
  return data.data;
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

  // Handle /start command
  if (text === "/start") {
    await sendTelegram(chatId, "👋 *Personal Assistant ready!*\n\nJust send me any note and I'll parse it and create a task in Asana.\n\nExamples:\n• _Call Marek tomorrow about the proposal_\n• _Review Q2 report before Friday_\n• _Buy coffee on the way home_");
    return res.status(200).json({ ok: true });
  }

  // Acknowledge quickly
  await sendTelegram(chatId, "⏳ Parsing your note...");

  try {
    const parsed = await callClaude(text);
    if (!parsed) throw new Error("Could not parse note");

    let reply = "";

    if (parsed.destination === "asana") {
      const task = await createAsanaTask(parsed);
      const dueStr = parsed.due_on ? `\n📅 Due: ${parsed.due_on}` : "";
      const priorityEmoji = parsed.priority === "high" ? "🔴" : parsed.priority === "low" ? "🟢" : "🟡";
      reply = `✅ *Task created in Asana*\n\n${priorityEmoji} *${parsed.title}*${dueStr}${parsed.notes ? `\n📝 ${parsed.notes}` : ""}\n\n[Open in Asana](https://app.asana.com/0/0/${task.gid})`;
    } else {
      reply = `📝 *Note saved*\n\n_${parsed.title}_${parsed.notes ? `\n${parsed.notes}` : ""}`;
    }

    await sendTelegram(chatId, reply);
  } catch (err) {
    console.error(err);
    await sendTelegram(chatId, "❌ Something went wrong. Please try again.");
  }

  return res.status(200).json({ ok: true });
}
