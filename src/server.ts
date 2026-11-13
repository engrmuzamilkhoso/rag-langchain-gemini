// ─────────────────────────────────────────────────────────────
// WEB SERVER: the chat page + a small API
// Run: npm start   →   open http://localhost:3001 (PORT in .env)
// ─────────────────────────────────────────────────────────────
import express from "express";
import { createAgent } from "./agent/agent.js";
import { statementPdf } from "./agent/pdf.js";
import { latestSms } from "./agent/sms.js";
import { config } from "./config.js";
import { assertGeminiConfig, isGeminiBusy } from "./llm/gemini.js";
import { warmSearch } from "./rag/search.js";

// Fail at startup if .env is missing the key
assertGeminiConfig();

const app = express();
app.use(express.json());
app.use(express.static("public")); // serves public/index.html

type Agent = ReturnType<typeof createAgent>;

// One agent per browser chat (each has its own session + history)
const agents = new Map<string, Agent>();

function getAgent(chatId: string): Agent {
  let agent = agents.get(chatId);
  if (!agent) {
    agent = createAgent();
    agents.set(chatId, agent);
  }
  return agent;
}

// Who is the customer, as far as THIS chat's session knows
function sessionStatus(agent: Agent) {
  const { verifiedCustomer, pendingCustomer } = agent.session;
  if (verifiedCustomer) return { state: "verified", name: verifiedCustomer.name };
  if (pendingCustomer) return { state: "pending", name: null };
  return { state: "anonymous", name: null };
}

// ── Send a message to the agent ──
app.post("/api/chat", async (req, res) => {
  const { chatId, message } = req.body ?? {};

  if (typeof chatId !== "string" || typeof message !== "string" || message.trim() === "") {
    res.status(400).json({ error: "chatId and message are required" });
    return;
  }

  try {
    const agent = getAgent(chatId);
    const toolCalls: { name: string; args: unknown }[] = [];

    const reply = await agent.reply(message, (name, args) => toolCalls.push({ name, args }));

    // A statement was fetched this turn → the page shows a PDF download button
    const fetched = toolCalls.findLast((call) => call.name === "getStatement")?.args as { month?: string } | undefined;
    const statement = fetched?.month && agent.session.statements[fetched.month] ? { month: fetched.month } : null;

    // Statement fetched → short message (the PDF has the lines).
    // Not fetched but the AI claims a PDF anyway → don't let that through.
    const claimsPdf = /pdf|download/i.test(reply);
    const text = statement
      ? `Your statement for ${statement.month} is ready. Download it as a PDF below.`
      : claimsPdf
        ? "Sorry, I couldn't get that statement. Please tell me the month again."
        : reply;
    res.json({ reply: text, toolCalls, statement, session: sessionStatus(agent) });

  } catch (error) {
    console.error(error);
    if (isGeminiBusy(error)) {
      res.status(503).json({ error: "The AI service is busy right now. Please try again in a minute." });
      return;
    }
    res.status(500).json({ error: "Something went wrong. Is Postgres running?" });
  }
});

// ── Download a statement as PDF ──
// Only months this chat's VERIFIED customer already fetched with getStatement
app.get("/api/statement.pdf", (req, res) => {
  const { chatId, month } = req.query;
  const agent = typeof chatId === "string" ? agents.get(chatId) : undefined;
  const statement = agent?.session.verifiedCustomer && typeof month === "string" ? agent.session.statements[month] : undefined;

  if (!statement) {
    res.status(404).send("Statement not found. Ask for it again in the chat.");
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="statement-${statement.month}.pdf"`);
  res.send(statementPdf(statement));
});

// ── Start a fresh chat ──
app.post("/api/reset", (req, res) => {
  const chatId = req.body?.chatId;
  if (typeof chatId === "string") agents.delete(chatId);
  res.json({ ok: true });
});

// ── DEMO ONLY: the pretend phone's SMS inbox ──
// In a real app the code goes to the customer's phone, never to a web API.
// Only THIS chat's phone, and only after this chat asked for a code
// (otherwise codes from other chats/tabs would pop up here too).
app.get("/api/demo/sms", (req, res) => {
  const chatId = req.query.chatId;
  const agent = typeof chatId === "string" ? agents.get(chatId) : undefined;
  const customer = agent?.session.verifiedCustomer ?? agent?.session.pendingCustomer;
  const since = agent?.session.codeRequestedAt;
  if (!customer || !since) {
    res.json([]);
    return;
  }
  res.json(latestSms().filter((sms) => sms.to === customer.phone && sms.sentAt >= since));
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Chat running on http://localhost:${port} (Gemini: ${config.gemini.chatModel})`);
  // Connect to Postgres now (~3s to Supabase Tokyo), not on the first customer's message
  const started = performance.now();
  warmSearch()
    .then(() => console.log(`Database ready (${Math.round(performance.now() - started)} ms)`))
    .catch((error) => console.error("Database warm-up failed:", error instanceof Error ? error.message : error));
});
