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
      <Bruh />
      <div
        className={cn(
          "h-full transition-opacity duration-1000 ease-in-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="fixed top-4 right-4 grid grid-flow-col auto-cols-max gap-x-2 items-start z-20">
          <ShortcutLegend/>
          <Settings/>
        </div>
        <Chat/>
        <div className="hidden md:block">
        </div>
        <div className="fixed bottom-4 right-4 hidden md:block">
          <img
            src={LogoIcon("github.com", {type: "symbol", theme: "light"})}
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
