import { useEffect, useState } from "react";
import { toast } from "sonner";
import BruhMessage from "@/components/messages/bruh-message";
import UserMessage from "@/components/messages/user-message";
import { messageText } from "@/lib/chat";
import type { ChatMessage } from "@/lib/types";
import { copyToClipboard } from "@/lib/utils";

type MessagesProps = {
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
};

function isTyping(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function Messages({ messages, setMessages }: MessagesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = messages.findIndex((m) => m.id === selectedId);
  const selected = selectedIndex >= 0 ? messages[selectedIndex] : undefined;

  const move = (direction: "up" | "down"): void => {
    if (messages.length === 0) return;
    const next = !selected
      ? direction === "up"
        ? messages.length - 1
        : 0
      : direction === "up"
        ? Math.max(0, selectedIndex - 1)
        : Math.min(messages.length - 1, selectedIndex + 1);
    setSelectedId(messages[next]?.id ?? null);
  };

  const copySelected = async (message: ChatMessage): Promise<void> => {
    if (!(await copyToClipboard(messageText(message)))) return;
    toast.custom(() => (
      <span className="text-rambutan-400 text-sm">
        Message <span className="text-pandan-500">copied</span>
      </span>
    ));
  };

  const deleteSelected = (message: ChatMessage): void => {
    const previous = messages;
    const next = messages.filter((m) => m.id !== message.id);
    setMessages(next);
    const neighbour = next[Math.min(selectedIndex, next.length - 1)];
    setSelectedId(neighbour?.id ?? null);
    toast.custom((id) => (
      <span className="text-rambutan-400 flex items-center gap-3 text-sm">
        <span>
          Message <span className="text-lychee-500">deleted</span>
        </span>
        <button
          type="button"
          onClick={() => {
            setMessages(previous);
            toast.dismiss(id);
          }}
          className="rounded-seed text-persimmon-300 hover:bg-longan-800 focus-visible:outline-persimmon-400 px-1.5 focus-visible:outline-2"
        >
          Undo
        </button>
      </span>
    ));
  };

  // A window listener with cleanup: the remaining legitimate use of an effect.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTyping()) {
        setSelectedId(null);
        return;
      }
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
      if (
        selected &&
        event.key === "c" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        void copySelected(selected);
        return;
      }
      // Leave every other modified key (⌘K, ⌘C without a selection…) to the browser
      // and the command bar.
      if (hasModifier) return;

      if (event.key === "Escape") {
        setSelectedId(null);
      } else if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        move(event.key === "k" ? "up" : "down");
      } else if (event.key === "d" && selected) {
        deleteSelected(selected);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      {messages.map((message) => {
        const isSelected = message.id === selectedId;
        const content = messageText(message);
        const error = message.metadata?.error;

        if (message.role === "assistant") {
          return (
            <BruhMessage
              key={message.id}
              content={content}
              error={error}
              selected={isSelected}
            />
          );
        }
        if (message.role === "user") {
          return (
            <UserMessage
              key={message.id}
              content={content}
              error={error}
              selected={isSelected}
            />
          );
        }
        return null;
      })}
    </>
  );
}
