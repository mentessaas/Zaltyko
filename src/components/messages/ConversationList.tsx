"use client";

import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface Participant {
  userId: string;
  role: string;
  profile?: {
    fullName?: string;
    avatarUrl?: string;
  };
}

interface ConversationPreview {
  id: string;
  title?: string | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: Date | null;
  otherParticipants: Participant[];
  unreadCount: number;
  metadata?: {
    type?: string;
  };
}

interface ConversationListProps {
  conversations: ConversationPreview[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onNewConversation?: () => void;
  canStartConversation?: boolean;
  emptyStateHint?: string;
}

export const ConversationList = memo(function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  canStartConversation = true,
  emptyStateHint,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Mensajes</h2>
        {canStartConversation && onNewConversation ? (
          <button
            onClick={onNewConversation}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            title="Nueva conversación"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <p className="text-sm">No hay conversaciones aún</p>
            {canStartConversation && onNewConversation ? (
              <button
                onClick={onNewConversation}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Iniciar una conversación
              </button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {emptyStateHint ?? "Las nuevas conversaciones se habilitan desde la academia o por invitación del staff."}
              </p>
            )}
          </div>
        ) : (
          conversations.map((conv) => {
            const otherUser = conv.otherParticipants[0]?.profile;
            const displayName =
              conv.title ||
              otherUser?.fullName ||
              "Usuario sin nombre";
            const isSelected = conv.id === selectedId;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                  isSelected ? "bg-muted" : ""
                } ${conv.unreadCount > 0 ? "font-medium" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {otherUser?.avatarUrl ? (
                      <img
                        src={otherUser.avatarUrl}
                        alt={displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-medium text-primary">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm truncate">{displayName}</span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.lastMessageAt), {
                            addSuffix: false,
                            locale: es,
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessagePreview || "Sin mensajes"}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground rounded-full min-w-[18px] text-center">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});
