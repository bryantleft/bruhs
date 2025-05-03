import Input from "@/components/chat/input";
import MessageHistory from "@/components/chat/message-history";

export default function Chat() {
  return (
    <div className="mx-auto h-full w-full overscroll-none md:w-1/2">
      <div
        className="pointer-events-none fixed top-0 z-10 h-8 w-full md:w-1/2 bg-gradient-to-b from-platinum-950 to-transparent"
      />
      <div className="mx-auto flex w-[94%] flex-col gap-y-4 pt-4 pb-36">
        <MessageHistory/>
      </div>
      <div className="group fixed bottom-0 w-full md:w-1/2">
        <div
          className="pointer-events-none h-8 w-full bg-gradient-to-t from-platinum-950 to-transparent"
        />
        <div className="bg-platinum-950">
          <Input/>
        </div>
      </div>
    </div>
  );
}
