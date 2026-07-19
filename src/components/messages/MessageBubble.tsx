"use client";

import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface MessageBubbleProps {
  content: string;
  senderName?: string;
  senderAvatar?: string;
  isOwnMessage: boolean;
  createdAt: string;
  editedAt?: string | null;
  attachmentUrl?: string | null;
  isDelivered?: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  content,
  senderName,
  isOwnMessage,
  createdAt,
  editedAt,
  attachmentUrl,
}: MessageBubbleProps) {
  const formattedTime = formatDistanceToNow(new Date(createdAt), {
    addSuffix: true,
    locale: es,
  });

  return (
    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isOwnMessage
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        }`}
      >
        {!isOwnMessage && senderName && (
          <p className="text-xs font-medium text-primary/70 mb-1">
            {senderName}
          </p>
        )}

        {attachmentUrl && (
          <div className="mb-2">
            {attachmentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img
                src={attachmentUrl}
                alt="Attachment"
                className="rounded-lg max-w-full max-h-48 object-cover"
              />
            ) : (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm underline"
              >
                📎 Ver archivo adjunto
              </a>
            )}
          </div>
        )}

        <p className="text-sm whitespace-pre-wrap break-words">{content}</p>

        <div
          className={`text-[10px] mt-1 ${
            isOwnMessage ? "text-primary-foreground/60" : "text-muted-foreground"
          }`}
        >
          {formattedTime}
          {editedAt && " •-editado"}
        </div>
      </div>
    </div>
  );
});
