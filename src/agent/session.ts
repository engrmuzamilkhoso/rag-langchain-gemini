// ─────────────────────────────────────────────────────────────
// SESSION: who is talking, and are they verified?
// Lives in CODE. The AI can never change it by "saying" something.
//
//   anonymous  →  pending (code sent)  →  verified ✅
// ─────────────────────────────────────────────────────────────
import type { Customer } from "./otp.js";
import type { Statement } from "./pdf.js";

export type Session = {
  pendingCustomer: Customer | null; // phone found + code sent, waiting for the code
  verifiedCustomer: Customer | null; // typed the correct code
  codeRequestedAt: string | null; // when this chat first asked for a code (demo phone shows SMS from here on)
  userMessages: string[]; // what the CUSTOMER really typed
  statements: Record<string, Statement>; // fetched statements by month ("2026-09"), for the PDF download
};

export function createSession(): Session {
  return {
    pendingCustomer: null,
    verifiedCustomer: null,
    codeRequestedAt: null,
    userMessages: [],
    statements: {},
  };
}
