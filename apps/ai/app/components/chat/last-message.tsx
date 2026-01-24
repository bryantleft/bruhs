import BruhMessage from "@/components/messages/bruh-message";
import { useMessageStore } from "@/lib/stores";

export default function LastMessage() {
  const { lastMessage, generating } = useMessageStore();

  if (lastMessage.role !== "assistant" || !generating) return null;

  return <BruhMessage key={lastMessage.id} message={lastMessage} />;
}
