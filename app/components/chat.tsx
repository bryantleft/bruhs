import Input from "@/components/chat/input";
import MessageHistory from "@/components/chat/message-history";

export default function Chat() {
  return (
    <div className="mx-auto h-full w-full overscroll-none md:w-1/2">
      <div className="mx-auto flex w-[96%] flex-col gap-y-4 pt-4 pb-36">
        <MessageHistory />
      </div>
      <div className="group fixed bottom-0 w-full md:w-1/2">
        <Input />
      </div>
    </div>
  );
}
