import { ProviderLogo, models } from "@/lib/data";
import { useLLMStore } from "@/lib/stores";
import type { Model } from "@/lib/types";
import { cn } from "@/lib/utils";
import React, { useState, useEffect, useRef } from "react";

export default function Select() {
  const { model, setModel } = useLLMStore();
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  const handleOptionClick = async (option: Model) => {
    setModel(option);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={selectRef} className="relative w-2/5">
      <div
        onMouseDown={() => setIsOpen(!isOpen)}
        className={cn(
          "cursor-pointer rounded bg-platinum-950 p-1",
          "border-[0.5px] border-platinum-900 hover:border-platinum-800",
        )}
      >
        <div className="flex items-center justify-between gap-x-2 p-2">
          <div className="flex items-center gap-x-2">
            <img
              src={ProviderLogo(model.provider)}
              alt={`${model.provider} logo`}
              width={20}
              height={20}
              className="select-none rounded-full"
            />
            <span className="select-none text-platinum-400 text-xs">
              {model.name}
            </span>
          </div>
          <span
            className={cn(
              "iconify lucide--chevron-up h-5 w-5 transform text-platinum-800",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </div>
      </div>

      {isOpen && (
        <div className="absolute bottom-full z-10 mb-1 w-full rounded border-[0.5px] border-platinum-900 bg-platinum-950 p-1 shadow-lg">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex cursor-pointer items-center gap-x-2 rounded p-2 hover:bg-platinum-800"
              onMouseDown={() => handleOptionClick(model)}
            >
              <img
                src={ProviderLogo(model.provider)}
                alt={`${model.provider} logo`}
                width={20}
                height={20}
                className="select-none rounded-full"
              />
              <span className="select-none text-platinum-400 text-xs">
                {model.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
