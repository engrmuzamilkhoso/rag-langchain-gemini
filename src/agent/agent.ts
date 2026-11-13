// ─────────────────────────────────────────────────────────────
// THE AGENT: one chat, with its own session, tools and history
//
// For each user message:
//   AI decides → (tool? run it → give result back → AI again) → answer
// ─────────────────────────────────────────────────────────────
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { config } from "../config.js";
import { createGeminiChatModel } from "../llm/gemini.js";
import { agentInstructions } from "./prompt.js";
import { lastMentionedMonth } from "./grounding.js";
import { createSession } from "./session.js";
import { createTools } from "./tools.js";

type ToolRequest = { name: string; args: Record<string, unknown>; id?: string };

const MAX_STEPS = 5; // stop a confused AI from looping forever

export function createAgent() {
  // ── 1. This chat's session + tools ──
  const session = createSession();
  const tools = createTools(session);

  // ── 2. The AI, with its tool menu ──
  const model = createGeminiChatModel().bindTools(
    [tools.searchPolicy, tools.startVerification, tools.verifyCode, tools.getStatement],
    { timeout: config.gemini.timeoutMs },
  );

  // ── 3. The conversation (the AI has no memory, so we keep it) ──
  const today = new Date().toISOString().slice(0, 10); // "2026-10-23"
  const history: BaseMessage[] = [new SystemMessage(agentInstructions(today))];

  // ── 4. Run the tool the AI asked for (match by NAME) ──
async function runTool(request: ToolRequest): Promise<ToolMessage> {
  const call = { ...request, id: request.id ?? "", type: "tool_call" as const };

  try {
    switch (request.name) {
      case "searchPolicy":
        return await tools.searchPolicy.invoke(call);
      case "startVerification":
        return await tools.startVerification.invoke(call);
      case "verifyCode":
        return await tools.verifyCode.invoke(call);
      case "getStatement":
        return await tools.getStatement.invoke(call);
      default:
        return new ToolMessage({ content: `Unknown tool: ${request.name}`, tool_call_id: call.id });
    }
  } catch (error) {
    // Zod rejected the arguments → tell the AI instead of crashing
    const reason = error instanceof Error ? error.message : String(error);
    return new ToolMessage({ content: `Tool error: ${reason}`, tool_call_id: call.id });
  }
}

  // ── 5. Answer one user message ──
  async function reply(userText: string, onToolCall?: (name: string, args: unknown) => void): Promise<string> {
    history.push(new HumanMessage(userText));
    session.userMessages.push(userText);
    const wasVerified = session.verifiedCustomer !== null;
    let fetchedStatement = false;

    // Run one tool, record it, add the result to the conversation
    async function callTool(request: ToolRequest) {
      onToolCall?.(request.name, request.args);
      const result = await runTool(request);
      if (request.name === "getStatement" && String(result.content).startsWith("Statement for")) fetchedStatement = true;
      history.push(result);
    }

    // Statement fetched → the answer is always the same, so skip another (slow) AI call
    function statementReady(): string {
      const answer = "Your statement is ready. Download it as a PDF below.";
      history.push(new AIMessage(answer));
      return answer;
    }

    for (let step = 0; step < MAX_STEPS; step++) {
      // Ask the AI: answer, or a tool?
      const aiMessage = await model.invoke(history);
      history.push(aiMessage);

      // No tool requested → this is the final answer
      if (!aiMessage.tool_calls?.length) {
        // The AI often skips getStatement right after verifying, or on "send it again".
        // If the customer is verified and named a month, fetch it in CODE (still through the tool's checks).
        // Only the CUSTOMER's words count: the AI's own answer often says "statement"
        // ("refunds appear on your statement") and that must not trigger a download.
        const wantsStatement = /statement|pdf|download|send (it|me)|resend|again/i.test(userText);
        const justVerified = !wasVerified && session.verifiedCustomer !== null;
        const month = lastMentionedMonth(session.userMessages, today);
        if (!fetchedStatement && session.verifiedCustomer && month && (wantsStatement || justVerified)) {
          const request = { name: "getStatement", args: { month }, id: `auto-${Date.now()}` };
          history.pop(); // drop the answer that skipped the tool
          history.push(new AIMessage({ content: "", tool_calls: [request] }));
          await callTool(request);
          if (fetchedStatement) return statementReady();
          continue; // the AI now answers from the real result
        }
        return aiMessage.text;
      }

      // Tool(s) requested → run each one
      for (const request of aiMessage.tool_calls) await callTool(request);

      // Statement fetched → the answer is always the same, so skip another (slow) AI call
      if (fetchedStatement) return statementReady();
      // ...then loop: the AI reads the results and decides again
    }

    return "Sorry, I couldn't finish that. Please contact support.";
  }

  return { reply, session };
}
