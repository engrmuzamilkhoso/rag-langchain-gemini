# rag-langchain-gemini

A support assistant for a payment company, built with **LangChain.js**, **PostgreSQL + pgvector** (Supabase) and **Google Gemini**.

- **RAG**: answers policy questions (refunds, settlements, API rules) from Markdown documents
- **Agent**: verifies the customer with a one-time SMS code, then gets their own monthly statement from the database and offers it as a **PDF**
- **Security in code, not in the prompt**: the AI chooses tools; your code decides what's allowed
- **Evals**: a 15-question exam that measures search and answer accuracy

> An Ollama (fully local) version of the same app lives in a separate repo.

## Stack

| Part | Choice |
|---|---|
| Chat model | Gemini via `@langchain/google-genai` (default `gemini-3.1-flash-lite`) |
| Embeddings | `gemini-embedding-001`, 768 dimensions |
| Vector store | Postgres + pgvector via `@langchain/pgvector` (Supabase or local Docker) |
| Server | Node 24, Express 5, TypeScript (strict), `tsx` |
| Frontend | One static page: `public/index.html` (no build step) |

## How it works

```
INGEST (once)    docs/*.md → split into chunks → Gemini embeddings (768 dims) → Postgres (pgvector)

RAG              question → search Postgres → prompt with the chunks → AI → answer + sources

AGENT            message → AI decides → tool? → your code runs it → result back to AI → answer
                 tools: searchPolicy · startVerification · verifyCode · getStatement
```

### One chat message, start to end

```
Browser  ──POST /api/chat { chatId, message }──►  server.ts
                                                     │  finds this chat's agent (own history + session)
                                                     ▼
                                                  agent.ts   the loop (max 5 rounds)
                                                     │  1. Gemini reads the history → answer, or "call tool X"
                                                     │  2. tool requested → tools.ts runs it → result added
                                                     │  3. back to 1 until Gemini answers
                                                     ▼
                                                  tools.ts
                                                     ├─ searchPolicy       → rag/search.ts (embed + pgvector)
                                                     ├─ startVerification  → agent/otp.ts (find customer, send code)
                                                     ├─ verifyCode         → agent/otp.ts (check code → session verified)
                                                     └─ getStatement       → transactions table (customer from SESSION)
                                                     ▼
Browser  ◄──{ reply, toolCalls, statement, session }── server.ts  (final checks: PDF button, block fake "PDF ready")
```

A policy question costs **2 Gemini calls** (decide → answer). When a statement is fetched, the reply is fixed text, so the second call is skipped.

## Folders

```
public/
  index.html         the web chat page (chat, session badge, demo phone, OTP notifications)
src/
  server.ts          web server: the page + /api/chat, /api/statement.pdf, /api/reset, /api/demo/sms
  config.ts          all settings (models, URLs, numbers)
  db.ts              one Postgres connection pool (TLS for Supabase)
  llm/
    gemini.ts        the only place that creates Gemini clients; checks the API key
  rag/
    store.ts         the vector store (pgvector)
    ingest.ts        docs → chunks → Postgres
    search.ts        find related chunks (+ warm-up at server start)
    answer.ts        the RAG chain: search → prompt → AI
    ask.ts           ask one question from the command line
  agent/
    agent.ts         the agent loop
    tools.ts         the 4 tools + security checks
    prompt.ts        the agent's instructions
    session.ts       who is talking, are they verified
    otp.ts           find customer, send code, check code (no AI)
    grounding.ts     did the CUSTOMER really type that code / month?
    sms.ts           pretend SMS provider (feeds the demo phone)
    pdf.ts           statement → PDF (no dependencies)
    format.ts        money formatting (DEBIT / CREDIT)
    chat.ts          chat with the agent in the terminal
evals/
  cases.ts           the questions + expected answers
  run.ts             runs the exam, prints the score
sql/
  schema.sql         tables + sample data for the agent
docs/                the policy documents
```

## Run it

You need **Node 24**, a Gemini API key from [Google AI Studio](https://aistudio.google.com) and a Postgres database with pgvector:
**Supabase** (recommended) or local Docker on port 5433.

**Supabase setup (once):**
1. Create a project. In **SQL Editor**, run `sql/schema.sql` (enables `vector`, creates the tables with RLS, adds sample data).
2. **Connect → Session pooler**: copy the URI into `DATABASE_URL` in `.env`.
   Use the Session pooler: the direct connection is IPv6-only on the free plan, and the transaction pooler doesn't fit `PGVectorStore`, which holds one connection open.
3. **Project Settings → Database → SSL Configuration**: download the certificate to `certs/supabase-ca.crt`, so the app verifies the server (without it the connection is still encrypted, but unverified).

```bash
npm install
cp .env.example .env                              # then fill in GEMINI_API_KEY and DATABASE_URL
npm run ingest                                    # load the docs (once, and after changing the embedding model)
npm run dev                                       # web chat → http://localhost:3001 (reloads on save)
npm start                                         # same, without reloading
npm run ask -- "How long do card refunds take?"   # one RAG question in the terminal
npm run chat                                      # talk to the agent in the terminal
npm run eval                                      # the exam
npm run typecheck
```

### Try the agent

1. Ask a policy question, e.g. *"How long do card refunds take?"* → `searchPolicy`
2. Ask *"I want my October 2026 statement"* → it asks for your phone number
3. Phone: `03001234567` (sample customer)
4. The code arrives as a notification at the top of the page → **Fill in chat**
5. Verified → `getStatement` → **Download statement (PDF)**

The page shows which tools the agent called, the session state (not verified / code sent / verified)
and a **demo phone** inbox. The code goes to the "phone", never to the AI.

## Security decisions

- The OTP code is **never** returned to the AI. It's hashed (HMAC-SHA256), expires in 5 minutes, and allows 3 attempts.
- Verification is stored in the **session, in code**. The AI cannot mark anyone as verified.
- `verifyCode` only accepts a code the customer actually typed, and `getStatement` only a month the customer actually named, so the AI can't make either up.
- `getStatement` takes only a month. The customer ID always comes from the session, so the AI can't request another customer's data.
- The PDF endpoint only serves statements this chat's verified customer already fetched.
- If the AI claims a PDF is ready without fetching one, the server replaces that reply.
- Money stays as exact text from Postgres (`NUMERIC`), and statements show DEBIT/CREDIT explicitly.
- The Gemini API key and the database URL live only in `.env` (git-ignored) and are read on the server. They never reach the browser or the logs.
- Every table has Row Level Security on with no policies, so Supabase's public REST API can't read customer data. The app connects directly as `postgres`.
- The database connection is TLS-encrypted, and verified against Supabase's CA certificate when `certs/supabase-ca.crt` is present.

## Gemini notes

- **Models**: `GEMINI_MODEL` (chat + tool calling) and `GEMINI_EMBED_MODEL` in `.env`. Pin exact names; `-latest` aliases change under you.
- **Speed differs a lot between models.** On the free tier, a one-word reply took ~1 s on `gemini-3.1-flash-lite`, ~8 s on `gemini-3.5-flash-lite` and ~48 s on `gemini-3.5-flash`. Free-tier latency also varies from call to call.
- **Free tier quota**: about 20 chat requests per day per model; each chat message uses 2–3.
- **Same question → same answer**: `searchPolicy` searches with the customer's own words, not the AI's rewording, so the same chunks come back every time. Temperature is 0.
- **Embeddings** are requested at 768 dimensions to match the vector table. Changing the embedding model or size means re-running `npm run ingest`.
- **Own vector table** (`lc_documents_gemini`): vectors from different embedding models can't be compared, so they never share a table.
- **Timeouts and busy errors**: every Gemini call times out after 30 s. 503 / 429 are retried, then shown to the user as "AI service is busy".
- **Privacy**: chat messages, including statement lines the agent reads, are sent to Google. Use a paid tier for real customer data.

## License

MIT, see [LICENSE](LICENSE).
