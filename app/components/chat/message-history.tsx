import {useMessageStore} from '@/lib/stores';
import BruhMessage from '@/components/messages/bruh-message';
import UserMessage from '@/components/messages/user-message';

export default function MessageHistory() {
  const { messageHistory } = useMessageStore();

  return (
    <>
      {messageHistory.map((message) => {
        if (message.role === "assistant")
          return <BruhMessage key={message.id} content={message.content} />;
        if (message.role === "user")
          return <UserMessage key={message.id} content={message.content} />;
      })}
    </>
  );
}