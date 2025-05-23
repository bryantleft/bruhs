import LastMessage from "@/components/chat/last-message";
import BruhMessage from "@/components/messages/bruh-message";
import UserMessage from "@/components/messages/user-message";
import { useMessageStore } from "@/lib/stores";
import { copyToClipboard } from "@/lib/utils";
import React, { useCallback, useEffect } from "react";
import { toast } from "sonner";

export default function Messages() {
  const { messages, selectedMessage, setSelectedMessage, deleteMessage } =
    useMessageStore();

  const deselectMessage = useCallback(() => {
    setSelectedMessage(null);
  }, [setSelectedMessage]);

  const navigateMessage = useCallback(
    (direction: "up" | "down") => {
      if (!selectedMessage) {
        const newIndex = direction === "up" ? messages.length - 1 : 1;
        setSelectedMessage(messages[newIndex]);
        return;
      }
      const currentIndex = messages.findIndex(
        (msg) => msg.id === selectedMessage.id,
      );
      const newIndex =
        direction === "up"
          ? Math.max(1, currentIndex - 1)
          : Math.min(messages.length - 1, currentIndex + 1);
      setSelectedMessage(messages[newIndex]);
    },
    [messages, selectedMessage, setSelectedMessage],
  );

  const copySelectedMessage = useCallback(async () => {
    if (!selectedMessage) return;
    await copyToClipboard(selectedMessage.content);
    toast.custom(() => (
      <span className="text-platinum-400 text-sm">
        Message <span className="text-emerald-500">copied</span>
      </span>
    ));
  }, [selectedMessage]);

  const deleteSelectedMessage = useCallback(() => {
    if (!selectedMessage) return;
    const currentIndex = messages.findIndex(
      (msg) => msg.id === selectedMessage.id,
    );
    deleteMessage(selectedMessage.id);
    const newMessages = messages.filter((msg) => msg.id !== selectedMessage.id);
    let newIndex: number;
    if (currentIndex >= newMessages.length) {
      newIndex = Math.max(1, newMessages.length - 1);
    } else {
      newIndex = Math.max(1, currentIndex);
    }
    setSelectedMessage(newMessages[newIndex]);
    toast.custom(() => (
      <span className="text-platinum-400 text-sm">
        Message <span className="text-ruby-500">deleted</span>
      </span>
    ));
  }, [messages, selectedMessage, deleteMessage, setSelectedMessage]);

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
  }, [
    selectedMessage,
    deselectMessage,
    navigateMessage,
    copySelectedMessage,
    deleteSelectedMessage,
  ]);

  return (
    <>
      {messages.map((message) => {
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
