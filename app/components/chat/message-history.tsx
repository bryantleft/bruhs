import LastMessage from "@/components/chat/last-message";
import BruhMessage from "@/components/messages/bruh-message";
import UserMessage from "@/components/messages/user-message";
import { useMessageStore } from "@/lib/stores";
import { copyToClipboard } from "@/lib/utils";
import React, { useEffect } from "react";
import { toast } from "sonner";

export default function MessageHistory() {
  const { messageHistory, selectedMessage, setSelectedMessage, deleteMessage } =
    useMessageStore();

  const deselectMessage = () => {
    setSelectedMessage(null);
  };

  const navigateMessage = (direction: "up" | "down") => {
    if (!selectedMessage) {
      const newIndex = direction === "up" ? messageHistory.length - 1 : 1;
      setSelectedMessage(messageHistory[newIndex]);
      return;
    }
    const currentIndex = messageHistory.findIndex(
      (msg) => msg.id === selectedMessage.id,
    );
    const newIndex =
      direction === "up"
        ? Math.max(1, currentIndex - 1)
        : Math.min(messageHistory.length - 1, currentIndex + 1);
    setSelectedMessage(messageHistory[newIndex]);
  };

  const copySelectedMessage = async () => {
    if (!selectedMessage) return;
    await copyToClipboard(selectedMessage.content);
    toast.custom(() => (
      <span className="text-platinum-400 text-sm">
        Message <span className="text-emerald-500">copied</span>
      </span>
    ));
  };

  const deleteSelectedMessage = () => {
    if (!selectedMessage) return;
    const currentIndex = messageHistory.findIndex(
      (msg) => msg.id === selectedMessage.id,
    );
    deleteMessage(selectedMessage.id);
    const newMessageHistory = messageHistory.filter(
      (msg) => msg.id !== selectedMessage.id,
    );
    let newIndex: number;
    if (currentIndex >= newMessageHistory.length) {
      newIndex = Math.max(1, newMessageHistory.length - 1);
    } else {
      newIndex = Math.max(1, currentIndex);
    }
    setSelectedMessage(newMessageHistory[newIndex]);
    toast.custom(() => (
      <span className="text-platinum-400 text-sm">
        Message <span className="text-ruby-500">deleted</span>
      </span>
    ));
  };

  useEffect(() => {
    const handleKeyPress = async (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement) {
        const isInputFocused =
          activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT";
        if (isInputFocused) {
          deselectMessage();
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        deselectMessage();
        return;
      }
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        navigateMessage(event.key === "k" ? "up" : "down");
        return;
      }
      if (!selectedMessage) return;
      if (event.key === "c" && (event.ctrlKey || event.metaKey)) {
        await copySelectedMessage();
        return;
      }
      if (event.key === "d") {
        deleteSelectedMessage();
        return;
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [messageHistory, selectedMessage, deleteMessage, setSelectedMessage]);

  return (
    <>
      {messageHistory.map((message) => {
        const isSelected = message.id === selectedMessage?.id;

        if (message.role === "assistant") {
          return (
            <BruhMessage
              key={message.id}
              message={message}
              selected={isSelected}
            />
          );
        }

        if (message.role === "user") {
          return (
            <UserMessage
              key={message.id}
              message={message}
              selected={isSelected}
            />
          );
        }

        return null;
      })}

      <LastMessage />
    </>
  );
}
