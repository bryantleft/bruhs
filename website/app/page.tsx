"use client";

import { useState } from "react";

const colorSwatches = [
  // Ruby
  { label: "Ruby 50", className: "bg-ruby-50" },
  { label: "Ruby 100", className: "bg-ruby-100" },
  { label: "Ruby 200", className: "bg-ruby-200" },
  { label: "Ruby 300", className: "bg-ruby-300" },
  { label: "Ruby 400", className: "bg-ruby-400" },
  { label: "Ruby 500", className: "bg-ruby-500" },
  { label: "Ruby 600", className: "bg-ruby-600" },
  { label: "Ruby 700", className: "bg-ruby-700" },
  { label: "Ruby 800", className: "bg-ruby-800" },
  { label: "Ruby 900", className: "bg-ruby-900" },
  { label: "Ruby 950", className: "bg-ruby-950" },
  // Gold
  { label: "Gold 50", className: "bg-gold-50" },
  { label: "Gold 100", className: "bg-gold-100" },
  { label: "Gold 200", className: "bg-gold-200" },
  { label: "Gold 300", className: "bg-gold-300" },
  { label: "Gold 400", className: "bg-gold-400" },
  { label: "Gold 500", className: "bg-gold-500" },
  { label: "Gold 600", className: "bg-gold-600" },
  { label: "Gold 700", className: "bg-gold-700" },
  { label: "Gold 800", className: "bg-gold-800" },
  { label: "Gold 900", className: "bg-gold-900" },
  { label: "Gold 950", className: "bg-gold-950" },
  // Emerald
  { label: "Emerald 50", className: "bg-emerald-50" },
  { label: "Emerald 100", className: "bg-emerald-100" },
  { label: "Emerald 200", className: "bg-emerald-200" },
  { label: "Emerald 300", className: "bg-emerald-300" },
  { label: "Emerald 400", className: "bg-emerald-400" },
  { label: "Emerald 500", className: "bg-emerald-500" },
  { label: "Emerald 600", className: "bg-emerald-600" },
  { label: "Emerald 700", className: "bg-emerald-700" },
  { label: "Emerald 800", className: "bg-emerald-800" },
  { label: "Emerald 900", className: "bg-emerald-900" },
  { label: "Emerald 950", className: "bg-emerald-950" },
  // Amethyst
  { label: "Amethyst 50", className: "bg-amethyst-50" },
  { label: "Amethyst 100", className: "bg-amethyst-100" },
  { label: "Amethyst 200", className: "bg-amethyst-200" },
  { label: "Amethyst 300", className: "bg-amethyst-300" },
  { label: "Amethyst 400", className: "bg-amethyst-400" },
  { label: "Amethyst 500", className: "bg-amethyst-500" },
  { label: "Amethyst 600", className: "bg-amethyst-600" },
  { label: "Amethyst 700", className: "bg-amethyst-700" },
  { label: "Amethyst 800", className: "bg-amethyst-800" },
  { label: "Amethyst 900", className: "bg-amethyst-900" },
  { label: "Amethyst 950", className: "bg-amethyst-950" },
  // Onyx
  { label: "Onyx 50", className: "bg-onyx-50" },
  { label: "Onyx 100", className: "bg-onyx-100" },
  { label: "Onyx 200", className: "bg-onyx-200" },
  { label: "Onyx 300", className: "bg-onyx-300" },
  { label: "Onyx 400", className: "bg-onyx-400" },
  { label: "Onyx 500", className: "bg-onyx-500" },
  { label: "Onyx 600", className: "bg-onyx-600" },
  { label: "Onyx 700", className: "bg-onyx-700" },
  { label: "Onyx 800", className: "bg-onyx-800" },
  { label: "Onyx 900", className: "bg-onyx-900" },
  { label: "Onyx 950", className: "bg-onyx-950" },
  // Platinum
  { label: "Platinum 50", className: "bg-platinum-50" },
  { label: "Platinum 100", className: "bg-platinum-100" },
  { label: "Platinum 200", className: "bg-platinum-200" },
  { label: "Platinum 300", className: "bg-platinum-300" },
  { label: "Platinum 400", className: "bg-platinum-400" },
  { label: "Platinum 500", className: "bg-platinum-500" },
  { label: "Platinum 600", className: "bg-platinum-600" },
  { label: "Platinum 700", className: "bg-platinum-700" },
  { label: "Platinum 800", className: "bg-platinum-800" },
  { label: "Platinum 900", className: "bg-platinum-900" },
  { label: "Platinum 950", className: "bg-platinum-950" },
];

const colorGroups = [
  {
    name: "Ruby",
    swatches: colorSwatches.filter(s => s.className.startsWith("bg-ruby-")),
  },
  {
    name: "Gold",
    swatches: colorSwatches.filter(s => s.className.startsWith("bg-gold-")),
  },
  {
    name: "Emerald",
    swatches: colorSwatches.filter(s => s.className.startsWith("bg-emerald-")),
  },
  {
    name: "Amethyst",
    swatches: colorSwatches.filter(s => s.className.startsWith("bg-amethyst-")),
  },
  {
    name: "Onyx",
    swatches: colorSwatches.filter(s => s.className.startsWith("bg-onyx-")),
  },
  {
    name: "Platinum",
    swatches: colorSwatches.filter(s => s.className.startsWith("bg-platinum-")),
  },
  {
    name: "Other",
    colors: [
      { var: "--color-jet-black" },
      { var: "--color-royal-yellow" },
      { var: "--color-bruh-eye" },
      { var: "--color-bruh-mouth" }
    ]
  }
];

const fontVars = [
  { name: "Monaspace Argon", var: "--font-argon", className: "font-argon" },
  { name: "Monaspace Krypton", var: "--font-krypton", className: "font-krypton" },
  { name: "Monaspace Neon", var: "--font-neon", className: "font-neon" },
  { name: "Monaspace Radon", var: "--font-radon", className: "font-radon" },
  { name: "Monaspace Xenon", var: "--font-xenon", className: "font-xenon" }
];

function ColorGroupRow({ group }: { group: { name: string; swatches: { label: string; className: string }[] } }) {
  return (
    <div className="flex items-start mb-8 gap-4">
      <div className="w-28 shrink-0 text-left text-lg font-semibold tracking-wide uppercase text-neutral-700 dark:text-neutral-300 pt-3">
        {group.name}
      </div>
      <div className="flex flex-row flex-nowrap gap-2 overflow-visible">
        {group.swatches.map((swatch) => (
          <ColorSwatch key={swatch.className} {...swatch} />
        ))}
      </div>
    </div>
  );
}

function ColorSwatch({ label, className }: { label: string; className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-center w-8 z-0 relative overflow-visible">
      <button
        type="button"
        className={`w-8 h-8 rounded-md transition-all focus:outline-none relative group bg-transparent border-2 border-transparent hover:ring-2 hover:ring-emerald-400 focus:ring-2 focus:ring-emerald-500 hover:scale-110 focus:scale-110 hover:shadow-lg focus:shadow-lg active:scale-95 duration-150 ease-in-out cursor-pointer`}
        onClick={() => {
          navigator.clipboard.writeText(className);
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        }}
        aria-label={label}
      >
        <span className={`absolute inset-0 rounded-md ${className}`} />
        {copied && (
          <span className="absolute left-1/2 -top-10 -translate-x-1/2 text-xs px-2 py-1 bg-neutral-800 text-white dark:bg-neutral-200 dark:text-black rounded shadow pointer-events-none z-30 whitespace-nowrap mt-2">
            Copied
          </span>
        )}
      </button>
      <span className="text-[10px] mt-1 text-neutral-600 dark:text-neutral-400 text-center select-all">
        {label.split(' ').pop()}
      </span>
    </div>
  );
}

function FontSample({ name, variable, className }: { name: string; variable: string; className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`flex flex-col items-center gap-1 group focus:outline-none px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition ${className} cursor-pointer`}
      onClick={() => {
        navigator.clipboard.writeText(variable);
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }}
    >
      <span className="text-lg font-bold">{name}</span>
      <span className="text-base">The quick brown fox jumps over the lazy dog.</span>
      <span className="text-xs text-black/60 dark:text-white/60">{variable}</span>
      <span className={`text-xs text-emerald-600 h-4 transition-opacity ${copied ? "opacity-100" : "opacity-0"}`}>
        Copied
      </span>
    </button>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 flex flex-col gap-16 items-center transition-colors duration-300">
      <h1 className="text-3xl font-bold tracking-tight text-center mb-4">@bruhs/theme</h1>
      <section className="w-full max-w-6xl flex flex-col lg:flex-row gap-12 items-start justify-center">
        <div className="flex-1 w-full flex flex-col gap-8">
          <h2 className="text-2xl font-semibold mb-2 text-left">Colors</h2>
          {colorGroups.map(group => (
            group.swatches ? <ColorGroupRow key={group.name} group={group} /> : null
          ))}
        </div>
        <div className="flex-1 w-full flex flex-col gap-8">
          <h2 className="text-2xl font-semibold mb-2 text-left">Fonts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-6">
            {fontVars.map((font) => (
              <FontSample key={font.var} name={font.name} variable={font.var} className={font.className} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
