/**
 * Chat Handler — Conversational AI with MongoDB history
 * Provides natural chat experience while detecting automation intents
 */

import mongoose, { Schema, Document } from "mongoose";

// ============================================================
// MongoDB Connection & Models
// ============================================================

let isConnected = false;
const memoryMessages = new Map<string, any[]>();
const memorySessions = new Map<string, any>();

function rememberMessage(message: any) {
  const list = memoryMessages.get(message.sessionId) || [];
  list.push({ ...message, createdAt: message.createdAt || new Date() });
  memoryMessages.set(message.sessionId, list);
}

function rememberSession(sessionId: string, userAddress?: string, title?: string) {
  const existing = memorySessions.get(sessionId) || {};
  memorySessions.set(sessionId, {
    sessionId,
    userAddress: userAddress || existing.userAddress,
    title: title || existing.title || "New Chat",
    createdAt: existing.createdAt || new Date(),
    lastActivity: new Date(),
  });
}

export async function connectDB(mongoUri: string) {
  if (isConnected) return;

  try {
    const clientOptions = { serverApi: { version: "1", strict: true, deprecationErrors: true } } as any;
    await mongoose.connect(mongoUri, clientOptions);
    await mongoose?.connection?.db?.admin().command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    isConnected = true;

    console.log("[MongoDB] Connected successfully");
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err);
    throw err;
  }
}

// Chat Message Schema
interface IChatMessage extends Document {
  sessionId: string;
  userAddress?: string;
  role: "user" | "assistant" | "system";
  content: string;
  kind?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>({
  sessionId: { type: String, required: true, index: true },
  userAddress: { type: String, index: true },
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  kind: { type: String, default: "text" },
  metadata: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

// Index for efficient queries
ChatMessageSchema.index({ sessionId: 1, createdAt: 1 });
ChatMessageSchema.index({ userAddress: 1, createdAt: -1 });

export const ChatMessage = mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

// Chat Session Schema (for tracking active sessions)
interface IChatSession extends Document {
  sessionId: string;
  userAddress?: string;
  title?: string;
  lastActivity: Date;
  createdAt: Date;
}

const ChatSessionSchema = new Schema<IChatSession>({
  sessionId: { type: String, required: true, unique: true },
  userAddress: { type: String, index: true },
  title: { type: String },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

export const ChatSession = mongoose.model<IChatSession>("ChatSession", ChatSessionSchema);

// ============================================================
// Chat Intent Detection
// ============================================================

export interface ChatResponse {
  type: "chat" | "automation";
  message: string;
  automationIntent?: {
    summary: string;
    adapterType: string;
    params: Record<string, any>;
  };
  missingFields?: string[];
  nextQuestion?: string | null;
  suggestions?: string[];
}

const CHAT_SYSTEM_PROMPT = (manifest: any) => `
You are UARC — a blockchain automation assistant. You handle both conversation and task creation in a single response.

TOKEN ADDRESSES:
- USDC: ${manifest.tokens?.USDC?.address || manifest.tokens?.MockUSDC?.address || manifest.tokens?.MockUSDC || "<USDC>"}
- WETH: ${manifest.tokens?.WETH?.address || "<WETH>"}
- EURO: ${manifest.tokens?.MockEURO?.address || manifest.tokens?.MockEURO || "<EURO>"}

ADAPTER TYPES:
1. recurring_transfer — Params: { token, recipient, amountPerExecution (6 dec), startTime, interval (86400/604800/2592000), maxExecutions, fundingMode (0=vault,1=pull), fundingSource }
2. time_based_transfer — Params: { token, recipient, amount (6 dec), executeAfter }
3. cctp_bridge — Params: { token, amount (6 dec), destinationDomain (0=ETH,1=AVAX,2=OP,3=ARB,6=Base), mintRecipient, executeAfter }
4. stork_price_transfer — Params: { storkOracle, token, amount (6 dec), targetPrice (8 dec), isBelow, recipient }
5. uniswap_dca — Params: { tokenIn, tokenOut, fee, amountPerSwap, interval, totalSwaps, minAmountOut, recipient }
6. uniswap_limit_order — Params: { tokenIn, tokenOut, fee, amountIn, targetPrice, orderType (0=BUY,1=SELL,2=STOP,3=TP), minAmountOut, recipient, expiry }

RULES:
- Use prior conversation turns as memory. When a user answers a follow-up, merge it with the earlier request.
- For recurring/scheduled intents, prefer recurring_transfer over time_based_transfer.
- Convert amounts to 6-decimal integers (100 USDC = 100000000).
- Convert relative times to absolute unix timestamps (current + offset).
- If a field is still missing after checking conversation history, set missingFields to list it and set nextQuestion.
- Do NOT ask for information already provided in the conversation history.
- For pure chat (greetings, questions), set type="chat", automationIntent=null, missingFields=[].

RESPONSE FORMAT (strict JSON):
{
  "type": "chat" | "automation",
  "message": "concise response or confirmation",
  "automationIntent": null | {
    "summary": "human-readable summary",
    "adapterType": "<one of the 6 types>",
    "params": { ...all known params... }
  },
  "missingFields": [],
  "nextQuestion": null | "single question for the one most important missing field",
  "suggestions": []
}

When type="automation" and missingFields is empty, the task is ready to deploy — do not ask further questions.
When type="automation" and missingFields is non-empty, set nextQuestion to ask only the SINGLE most important missing field.
`;

function sessionTitleFromMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "New Chat";
  return normalized.length > 54 ? `${normalized.slice(0, 51)}...` : normalized;
}

async function createMistralClient(apiKey: string) {
  const importer = new Function("specifier", "return import(specifier)");
  const { Mistral } = await importer("@mistralai/mistralai");
  return new Mistral({ apiKey });
}

/**
 * Process a chat message and determine if it's conversation or automation intent
 */
export async function processChat(
  message: string,
  sessionId: string,
  manifest: any,
  apiKey: string,
  userAddress?: string
): Promise<ChatResponse> {
  const client = await createMistralClient(apiKey);

  // Get recent chat history for context (ascending order)
  const history = isConnected
    ? await ChatMessage.find({ sessionId })
      .sort({ createdAt: 1 })
      .limit(12)
      .lean()
    : (memoryMessages.get(sessionId) || []).slice(-12);

  const historyMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const currentTime = Math.floor(Date.now() / 1000);

  const response = await client.chat.complete({
    model: "mistral-large-latest",
    messages: [
      { role: "system", content: CHAT_SYSTEM_PROMPT(manifest) },
      ...historyMessages,
      {
        role: "user",
        content: `[timestamp: ${currentTime}][wallet: ${userAddress || "not connected"}] ${message}`,
      },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Mistral AI returned empty response");
  }

  const raw = typeof content === "string" ? content : JSON.stringify(content);
  let parsed: ChatResponse;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback if JSON parsing fails
    parsed = {
      type: "chat",
      message: raw,
    };
  }

  if (isConnected) {
    const isFirstUserMessage = !history.some((m) => m.role === "user");

    // Save messages to history
    await ChatMessage.create({
      sessionId,
      userAddress,
      role: "user",
      content: message,
      kind: "text",
    });

    await ChatMessage.create({
      sessionId,
      userAddress,
      role: "assistant",
      content: parsed.message,
      kind: parsed.type === "automation" ? "automation-intent" : "text",
      metadata: parsed.automationIntent ? { intent: parsed.automationIntent } : undefined,
    });

    // Update session last activity and promote the first user turn into the sidebar title.
    const sessionUpdate: Record<string, any> = {
      sessionId,
      userAddress,
      lastActivity: new Date(),
      $setOnInsert: { createdAt: new Date() },
    };
    if (isFirstUserMessage) {
      sessionUpdate.title = sessionTitleFromMessage(message);
    }

    await ChatSession.findOneAndUpdate(
      { sessionId },
      sessionUpdate,
      { upsert: true }
    );
  } else {
    const isFirstUserMessage = !(memoryMessages.get(sessionId) || []).some((m) => m.role === "user");
    rememberMessage({ sessionId, userAddress, role: "user", content: message, kind: "text" });
    rememberMessage({
      sessionId,
      userAddress,
      role: "assistant",
      content: parsed.message,
      kind: parsed.type === "automation" ? "automation-intent" : "text",
      metadata: parsed.automationIntent ? { intent: parsed.automationIntent } : undefined,
    });
    rememberSession(sessionId, userAddress, isFirstUserMessage ? sessionTitleFromMessage(message) : undefined);
  }

  return parsed;
}

export async function saveChatTurn(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  userAddress?: string,
  assistantKind: string = "text",
  metadata?: Record<string, any>
): Promise<void> {
  if (!isConnected) {
    const existingUserMessage = (memoryMessages.get(sessionId) || []).some((m) => m.role === "user");
    rememberMessage({ sessionId, userAddress, role: "user", content: userMessage, kind: "text" });
    rememberMessage({ sessionId, userAddress, role: "assistant", content: assistantMessage, kind: assistantKind, metadata });
    rememberSession(sessionId, userAddress, !existingUserMessage ? sessionTitleFromMessage(userMessage) : undefined);
    return;
  }

  const existingUserMessage = await ChatMessage.exists({ sessionId, role: "user" });

  await ChatMessage.create({
    sessionId,
    userAddress,
    role: "user",
    content: userMessage,
    kind: "text",
  });

  await ChatMessage.create({
    sessionId,
    userAddress,
    role: "assistant",
    content: assistantMessage,
    kind: assistantKind,
    metadata,
  });

  const sessionUpdate: Record<string, any> = {
    sessionId,
    userAddress,
    lastActivity: new Date(),
    $setOnInsert: { createdAt: new Date() },
  };
  if (!existingUserMessage) {
    sessionUpdate.title = sessionTitleFromMessage(userMessage);
  }

  await ChatSession.findOneAndUpdate({ sessionId }, sessionUpdate, { upsert: true });
}

/**
 * Get chat history for a session
 */
export async function getChatHistory(
  sessionId: string,
  limit: number = 50
): Promise<any[]> {
  if (!isConnected) return (memoryMessages.get(sessionId) || []).slice(-limit);

  const messages = await ChatMessage.find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  return messages;
}

/**
 * Get all sessions for a user address
 */
export async function getUserSessions(
  userAddress: string,
  limit: number = 20
): Promise<any[]> {
  if (!isConnected) {
    return Array.from(memorySessions.values())
      .filter((session) => !userAddress || session.userAddress === userAddress)
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, limit);
  }

  const sessions = await ChatSession.find({ userAddress })
    .sort({ lastActivity: -1 })
    .limit(limit)
    .lean();
  return sessions;
}

/**
 * Create a new chat session
 */
export async function createSession(
  userAddress?: string,
  title?: string
): Promise<string> {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  if (!isConnected) {
    rememberSession(sessionId, userAddress, title || "New Chat");
    return sessionId;
  }

  await ChatSession.create({
    sessionId,
    userAddress,
    title: title || "New Chat",
    lastActivity: new Date(),
    createdAt: new Date(),
  });

  return sessionId;
}

/**
 * Update session title (usually after first automation)
 */
export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  if (!isConnected) {
    const existing = memorySessions.get(sessionId);
    if (existing) memorySessions.set(sessionId, { ...existing, title, lastActivity: new Date() });
    return;
  }

  await ChatSession.findOneAndUpdate({ sessionId }, { title });
}

/**
 * Delete a session and its messages
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!isConnected) {
    memoryMessages.delete(sessionId);
    memorySessions.delete(sessionId);
    return;
  }

  await ChatMessage.deleteMany({ sessionId });
  await ChatSession.deleteOne({ sessionId });
}
