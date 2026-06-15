# Personal Assistant Telegram Bot

A Vercel serverless webhook that receives Telegram messages, parses them with Claude, and creates Asana tasks automatically.

---

## Deploy to Vercel (browser only, no terminal needed)

### 1. Upload this project to GitHub

1. Go to github.com → New repository → name it `assistant-bot` → Create
2. Click "uploading an existing file" → drag the 3 files in:
   - `api/webhook.js`
   - `vercel.json`
   - `package.json`
3. Click "Commit changes"

### 2. Deploy on Vercel

1. Go to vercel.com → "Add New Project"
2. Import your `assistant-bot` GitHub repo
3. Click "Deploy" (no changes needed)
4. Wait ~30 seconds → you'll get a URL like `https://assistant-bot-xyz.vercel.app`

### 3. Add environment variables

In Vercel → your project → Settings → Environment Variables, add these 4:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (sk-ant-...) |
| `TELEGRAM_BOT_TOKEN` | Your token from @BotFather |
| `ASANA_TOKEN` | Your Asana personal access token (see below) |
| `ASANA_WORKSPACE_ID` | Your Asana workspace ID (see below) |

Then go to Deployments → click the 3 dots on the latest deployment → **Redeploy**.

### 4. Get your Asana credentials

**Personal Access Token:**
1. Go to app.asana.com → click your avatar → My Settings → Apps → Personal Access Tokens
2. Create new token → copy it

**Workspace ID:**
1. Go to app.asana.com
2. Look at the URL when viewing your workspace — the number after `/0/` is your workspace ID
3. Or visit: `https://app.asana.com/api/1.0/workspaces` with your token to list them

### 5. Register your webhook with Telegram

Open this URL in your browser (replace the placeholders):

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_URL>/api/webhook
```

You should see: `{"ok":true,"result":true}`

### 6. Test it

Open Telegram → find your bot → send `/start` → then send any note like:
> Call Marek tomorrow about the proposal

Your bot should reply with a confirmed Asana task in seconds. ✅

---

## How it works

```
You (Telegram) → Vercel webhook → Claude parses note → Asana task created → Bot replies
```

Every message you send goes through this flow in ~2–3 seconds. Nothing runs on your computer.
