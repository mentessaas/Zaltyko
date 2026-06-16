"use client";

import { useState, useEffect, useCallback } from "react";
import { ConversationList } from "./ConversationList";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";

interface Participant {
  userId: string;
  role: string;
  profile?: {
    fullName?: string;
    avatarUrl?: string;
  };
}

interface Message {
  id: string;
  senderId: string;
  content: string;
  attachmentUrl?: string;
  createdAt: string;
  editedAt?: string;
}

interface Conversation {
  id: string;
  title?: string;
  participants: Participant[];
  currentUserRole?: string;
}

interface MessagesPageProps {
  currentUserId: string;
  currentUserRole?: string;
  currentUserProfile?: {
    fullName?: string;
    avatarUrl?: string;
  };
}

export function MessagesPage({
  currentUserId,
  currentUserRole,
  currentUserProfile,
}: MessagesPageProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStartConversation = false;
  const emptyStateHint =
    currentUserRole === "parent" || currentUserRole === "athlete"
      ? "Las nuevas conversaciones se habilitan desde la academia o por invitación del staff."
      : "La creación manual de conversaciones desde este panel se habilitará cuando esté lista la selección guiada de destinatarios.";

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      const data = await res.json();
      if (data.ok) {
        setConversations(data.data.items);
      } else {
        setError("No se pudieron cargar las conversaciones.");
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
      setError("No se pudieron cargar las conversaciones.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages when a conversation is selected
  const selectConversation = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages/conversations/${conversationId}`);
      const data = await res.json();
      if (data.ok) {
        setSelectedConversation(data.data.conversation);
        setMessages(data.data.messages);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
      setError("Error al cargar mensajes");
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Send message
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!selectedConversation) return;

      const res = await fetch(
        `/api/messages/conversations/${selectedConversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        // Add new message to list
        setMessages((prev) => [
          ...prev,
          {
            id: data.data.id,
            senderId: currentUserId,
            content,
            createdAt: data.data.createdAt,
          },
        ]);
        // Refresh conversations to update last message
        fetchConversations();
      } else {
        setError(data?.message || "No se pudo enviar el mensaje.");
      }
    },
    [selectedConversation, currentUserId, fetchConversations]
  );

  // Get other participant's name for message display
  const getOtherParticipantName = useCallback(
    (senderId: string) => {
      if (senderId === currentUserId) return currentUserProfile?.fullName;
      return selectedConversation?.participants.find(
        (p) => p.userId === senderId
      )?.profile?.fullName;
    },
    [selectedConversation, currentUserId, currentUserProfile]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* Conversation List - hidden on mobile when a conversation is selected */}
      <div
        className={`w-full md:w-80 lg:w-96 border-r flex-shrink-0 ${
          selectedConversation ? "hidden md:flex" : "flex"
        }`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id}
          onSelect={selectConversation}
          canStartConversation={canStartConversation}
          emptyStateHint={emptyStateHint}
        />
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        {error && (
          <div className="border-b border-border bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-center gap-3">
              {/* Back button on mobile */}
              <button
                onClick={() => setSelectedConversation(null)}
                className="md:hidden p-2 -ml-2 rounded-full hover:bg-muted"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-medium text-primary">
                  {selectedConversation.title?.charAt(0).toUpperCase() ||
                    selectedConversation.participants.find(
                      (p) => p.userId !== currentUserId
                    )?.profile?.fullName?.charAt(0).toUpperCase() ||
                    "?"}
                </span>
              </div>

              {/* Name */}
              <div className="flex-1">
                <h3 className="font-medium">
                  {selectedConversation.title ||
                    selectedConversation.participants.find(
                      (p) => p.userId !== currentUserId
                    )?.profile?.fullName ||
                    "Conversación"}
                </h3>
              </div>

              {/* Actions */}
              <button className="p-2 rounded-full hover:bg-muted">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                  />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>No hay mensajes aún. ¡Envía el primero!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    content={msg.content}
                    senderName={getOtherParticipantName(msg.senderId)}
                    isOwnMessage={msg.senderId === currentUserId}
                    createdAt={msg.createdAt}
                    editedAt={msg.editedAt}
                    attachmentUrl={msg.attachmentUrl}
                  />
                ))
              )}
            </div>

            {/* Input */}
            <MessageInput onSend={handleSendMessage} />
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-lg font-medium mb-1">Sin conversación seleccionada</p>
              <p className="text-sm">
                Selecciona una conversación o inicia una nueva
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
