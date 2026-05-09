/**
 * Chat Handler — Conversational AI with MongoDB history
 * Provides natural chat experience while detecting automation intents
 */

import mongoose, { Schema, Document } from "mongoose";

// ============================================================
// MongoDB Connection & Models
// ============================================================

let isConnected = false;

export async function connectDB(mongoUri: string) {
  if (isConnected) return;

  try {
    await mongoose.connect(mongoUri);
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
  suggestions?: string[];
}

const CHAT_SYSTEM_PROMPT = (manifest: any) => `
You are UARC — a friendly AI assistant for blockchain automation on Arc network.

You have two modes:
1. CHAT MODE: Normal conversation, answering questions, being helpful
2. AUTOMATION MODE: When the user wants to create an on-chain automation task

IMPORTANT RULES:
- If the user is greeting you (hi, hello, hey, etc.) or making small talk, respond naturally and friendly
- If the user is asking questions about UARC, crypto, or how the system works, explain helpfully
- ONLY switch to automation mode when the user clearly expresses intent to:
  - Send/transfer tokens (weekly, monthly, scheduled)
  - Create stop-loss or price alerts
  - Create limit orders or DCA swaps
  - Bridge tokens cross-chain
  - Set up recurring payments
  - Create any automated task

EXAMPLES OF CHAT (respond conversationally):
- "hi" → "Hey! I'm UARC, your blockchain automation assistant. What would you like to automate today?"
- "what can you do?" → Explain your capabilities
- "how does this work?" → Explain the automation system
- "thanks" → "You're welcome!"

EXAMPLES OF AUTOMATION (extract intent):
- "DCA 5 USDC into ETH weekly" -> AUTOMATION
- "try a 3 USDC limit order to ETH" -> AUTOMATION
- "send 50 USDC weekly to 0x123..." → AUTOMATION
- "create a stop loss at $2000" → AUTOMATION
- "pay my friend monthly" → AUTOMATION

PROTOCOL CAPABILITIES (from manifest):
${JSON.stringify(manifest?.adapters || {}, null, 2)}

RESPONSE FORMAT (JSON):
{
  "type": "chat" | "automation",
  "message": "Your response to the user",
  "automationIntent": null | { "summary": "...", "adapterType": "...", "params": {...} },
  "suggestions": ["optional", "suggestions", "for", "user"]
}

For CHAT type: message is your conversational response, automationIntent is null
For AUTOMATION type: message confirms what you understood, automationIntent contains parsed task details

Always be helpful, concise, and friendly. If you're not sure if it's an automation request, ask for clarification.
`;

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

  // Get recent chat history for context
  const history = isConnected
    ? await ChatMessage.find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
    : [];

  const historyMessages = history.reverse().map((m) => ({
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
        content: `[Current timestamp: ${currentTime}]\n[User wallet: ${userAddress || "not connected"}]\n\nUser: ${message}`,
      },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.7,
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

    // Update session last activity
    await ChatSession.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        userAddress,
        lastActivity: new Date(),
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
  }

  return parsed;
}

/**
 * Get chat history for a session
 */
export async function getChatHistory(
  sessionId: string,
  limit: number = 50
): Promise<any[]> {
  if (!isConnected) return [];

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
  if (!isConnected) return [];

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

  if (!isConnected) return sessionId;

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
  if (!isConnected) return;

  await ChatSession.findOneAndUpdate({ sessionId }, { title });
}

/**
 * Delete a session and its messages
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!isConnected) return;

  await ChatMessage.deleteMany({ sessionId });
  await ChatSession.deleteOne({ sessionId });
}
