import { useChat } from "@ai-sdk/react";
import Input from "@/components/chat/input";
import Messages from "@/components/chat/messages";
import { chat, markLastMessage } from "@/lib/chat";
import { useChatPersistence } from "@/lib/hooks/use-chat-persistence";
import { useLLMStore, useModel } from "@/lib/stores";

export default function Chat() {
  const { messages, status, setMessages, sendMessage, stop } = useChat({
    chat,
    throttle: 50,
  });
  const model = useModel();
  const key = useLLMStore((s) => s.keys[model.provider]);
  useChatPersistence(messages, status);

  const generating = status === "submitted" || status === "streaming";

  const send = (text: string): void => {
    sendMessage(
      { text },
      { body: { key, model: model.id, provider: model.provider } },
    ).catch((error: unknown) => {
      // `onError` on the chat already marked the message; this only catches setup bugs.
      console.error(error);
    });
  };

  const stopGenerating = async (): Promise<void> => {
    await stop();
    markLastMessage("Stopped");
  };

  return (
    <div className="mx-auto h-full w-full overscroll-none md:w-1/2">
      <div className="from-longan-950 pointer-events-none fixed top-0 z-10 h-8 w-full bg-gradient-to-b to-transparent md:w-1/2" />
      <div className="mx-auto flex w-[94%] flex-col gap-y-4 pt-4 pb-36">
        <Messages messages={messages} setMessages={setMessages} />
      </div>
      <div className="group fixed bottom-0 w-full md:w-1/2">
        <div className="from-longan-950 pointer-events-none h-8 w-full bg-gradient-to-t to-transparent" />
        <div className="bg-longan-950">
          <Input
            generating={generating}
            onSend={send}
            onStop={stopGenerating}
          />
        </div>
      </div>
    </div>
  );
}
