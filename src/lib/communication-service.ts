import { db } from "@/db";
import { messageHistory } from "@/db/schema/message-history";
import { eq, type InferInsertModel } from "drizzle-orm";

type MessageHistoryInsert = InferInsertModel<typeof messageHistory>;

export async function createMessageHistory(data: MessageHistoryInsert) {
  const [record] = await db.insert(messageHistory).values(data).returning();
  return record;
}

export async function updateMessageHistoryStatus(
  id: string,
  status: "pending" | "sent" | "delivered" | "read" | "failed" | "cancelled",
  meta?: Record<string, unknown>
) {
  const [record] = await db
    .update(messageHistory)
    .set({
      status,
      ...meta,
    })
    .where(eq(messageHistory.id, id))
    .returning();
  return record;
}

export async function getMessageTemplateById(id: string) {
  // Placeholder: this would query a message_templates table if it exists
  return null;
}
