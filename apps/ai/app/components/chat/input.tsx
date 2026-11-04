import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type React from "react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { defaultMessages } from "@/lib/data";
import { useGlobalHotkey } from "@/lib/hooks/use-global-hotkey";
import { useLLMStore, useMessageStore } from "@/lib/stores";
import type { APIError, Message } from "@/lib/types";
import { cn, randomKey } from "@/lib/utils";

// AI SDK 5+ messages carry `parts` instead of a `content` string; the app keeps
// its own `content` shape and converts at the useChat boundary.
function toUIMessage(message: Message): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.content }],
  };
}

function toMessage(message: UIMessage): Message {
  return {
    id: message.id,
    role: message.role,
    content: message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(""),
  };
}

const transport = new DefaultChatTransport({
  api: "/api/llm",
  // Keep the request body the /api/llm action expects: { role, content } messages.
  prepareSendMessagesRequest: ({ id, messages, body }) => ({
    body: {
      ...body,
      id,
      messages: messages.map((message) => {
        const { role, content } = toMessage(message);
        return { role, content };
      }),
    },
  }),
});

export default function Input() {
  const { model, keys } = useLLMStore();
  const {
    messages,
    lastMessage,
    generating,
    deleting,
    addMessage,
    addError,
    setLastMessage,
    setGenerating,
    setDeleting,
  } = useMessageStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  const {
    messages: chatMessages,
    status,
    setMessages,
    sendMessage,
    stop,
  } = useChat({
    transport,
    messages: defaultMessages.map(toUIMessage),
    onError: (error) => {
      const errorMessage: APIError = JSON.parse(error.message);

      if (errorMessage.code === "invalid_api_key") {
        addError("Must populate a valid API key for openai");
      } else if (errorMessage.message === "invalid x-api-key") {
        addError("Must populate a valid API key for anthropic");
      } else {
        addError(errorMessage.message);
      }
    },
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      // AI SDK 4 only called onFinish for completed responses.
      if (isAbort || isDisconnect || isError) return;
      addMessage(toMessage(message));
    },
    throttle: 50,
  });

  useGlobalHotkey({
    key: "/",
    handler: (e) => {
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT");
      if (!isInputFocused) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    },
  });

  useEffect(() => {
    setGenerating(status === "streaming");
  }, [status, setGenerating]);

  useEffect(() => {
    if (deleting) {
      setMessages(messages.map(toUIMessage));
      setDeleting(false);
    }
  }, [deleting, messages, setMessages, setDeleting]);

  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    setLastMessage(last && toMessage(last));
  }, [chatMessages, setLastMessage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: input can change textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "42px";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  function handleInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const newValue = e.target.value;
    setInput(newValue);
  }

  async function handleSendMessage() {
    if (!input.trim() || generating) return;

    const userMessage: Message = {
      id: randomKey(),
      role: "user",
      content: input,
    };
    addMessage(userMessage);
    setInput("");
    await sendMessage(toUIMessage(userMessage), {
      body: {
        key: keys?.[model.provider],
        model: model.id,
        provider: model.provider,
      },
    });
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSendMessage();
    }
  }

  async function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await handleSendMessage();
  }

  function handleStop() {
    stop();
    addMessage(lastMessage);
    addError("Stopped");
  }

  return (
    <form
      onSubmit={handleFormSubmit}
      className={cn(
        "relative overflow-hidden rounded-t-2xl bg-longan-900",
        "py-3",
        "border-longan-800 border-x-[0.5px] border-t-[0.5px]",
        "group-hover:border-longan-700",
      )}
    >
      <div className="relative flex flex-col px-4">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          rows={1}
          className={cn(
            "w-full resize-none py-2",
            "bg-longan-900 text-rambutan-200 text-sm placeholder:text-rambutan-300",
            "focus:outline-none",
            "overflow-y-auto",
            "scrollbar-thin scrollbar-thumb-rambutan-300 scrollbar-track-transparent",
          )}
          placeholder="Bruhhhh..."
          onKeyDown={handleKeyDown}
        />
        {!generating && (
          <div className="self-end">
            <button
              type="submit"
              disabled={generating || input.trim().length === 0}
              className={cn(
                "flex cursor-pointer rounded-lg bg-mangosteen-700 p-[5px] hover:bg-mangosteen-600",
                "transition-colors duration-200",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-mangosteen-700",
              )}
            >
              <span className="iconify lucide--arrow-up h-4 w-4 text-rambutan-300" />
            </button>
          </div>
        )}
        {generating && (
          <div className="self-end">
            <button
              type="button"
              onMouseDown={handleStop}
              className={cn(
                "relative flex cursor-pointer items-center justify-center rounded-lg",
                "bg-mangosteen-700 p-[5px] hover:bg-mangosteen-600",
                "transition-colors duration-200",
              )}
            >
              <span className="iconify lucide--loader-circle h-4 w-4 animate-spin text-rambutan-300" />
              <span className="iconify lucide--dot -translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-2 w-2 text-rambutan-300/60" />
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
