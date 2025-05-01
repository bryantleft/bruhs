import Bruh from "@/components/bruh";
import Chat from "@/components/chat";
import Settings from "@/components/settings";
import ShortcutLegend from "@/components/shortcut-legend";
import { LogoIcon } from "@/lib/data";
import { useExternalNavigation, useInitialScreenLoad } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import React from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [{ title: "llm" }, { name: "description", content: "llm" }];
};

export default function Index() {
  const { visible } = useInitialScreenLoad();
  const { navigate } = useExternalNavigation();

  return (
    <div className="h-full">
      <div className="hidden md:block">
        <Bruh />
      </div>
      <div
        className={cn(
          "h-full transition-opacity duration-1000 ease-in-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <Chat />
        <div className="hidden md:block">
          <Settings />
        </div>
        <div className="hidden md:block">
          <ShortcutLegend />
        </div>
        <div className="fixed bottom-4 left-4 hidden md:block">
          <img
            src={LogoIcon("github.com", { type: "symbol", theme: "light" })}
            alt={"github logo"}
            width={30}
            height={30}
            onMouseDown={() => navigate("https://github.com/bryantleft/llm")}
            className="cursor-pointer select-none rounded-full transition-transform duration-300 hover:scale-105"
          />
        </div>
      </div>
    </div>
  );
}
