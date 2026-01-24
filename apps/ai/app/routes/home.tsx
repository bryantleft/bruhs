import type { MetaFunction } from "react-router";
import Bruh from "@/components/bruh";
import Chat from "@/components/chat";
import CommandBar from "@/components/command-bar";
import Settings from "@/components/settings";
import ShortcutLegend from "@/components/shortcut-legend";
import { useInitialScreenLoad } from "@/lib/hooks/use-initial-screen-load";
import { cn } from "@/lib/utils";

export const meta: MetaFunction = () => {
  return [{ title: "Bruhs" }, { name: "description", content: "Bruhs" }];
};

export default function Index() {
  const { visible } = useInitialScreenLoad();

  return (
    <div className="h-full">
      <Bruh />
      <div
        className={cn(
          "h-full transition-opacity duration-1000 ease-in-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="fixed top-4 right-4 z-20 grid auto-cols-max grid-flow-col items-start gap-x-2">
          <CommandBar />
          <ShortcutLegend />
          <Settings />
        </div>
        <Chat />
        <div className="hidden md:block" />
      </div>
    </div>
  );
}
