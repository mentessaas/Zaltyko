"use client";
import ChatWidget from "./ChatWidget";

interface ChatWidgetWrapperProps {
  academyId?: string;
}

export function ChatWidgetWrapper({ academyId }: ChatWidgetWrapperProps) {
  // The widget is implemented and its API resolves the authenticated context;
  // keeping the wrapper mounted makes the assistant available from every
  // dashboard without leaking academy data through props.
  void academyId;
  return <ChatWidget />;
}
