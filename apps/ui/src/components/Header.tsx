import type { FunctionComponent } from "preact";

type HeaderProps = {
  current: string;
};

const descriptions = {
  colors: "The color palette.",
  typography: "The typographic scale and fonts."
} as const;

const Header: FunctionComponent<HeaderProps> = ({ current }) => {
  const links = [
    { label: "Colors", href: "/colors", key: "colors" as const },
    { label: "Typography", href: "/typography", key: "typography" as const }
  ];

  return (
    <header class="p-8 border-b border-lychee-100/5 flex flex-col gap-4">
      <a 
        href="/"
        class={
          current === "/"
            ? "text-sm font-bold tracking-tighter font-krypton text-lychee-100 transition-opacity duration-200"
            : "text-sm font-bold tracking-tighter font-krypton text-lychee-100/40 hover:text-lychee-100/70 transition-opacity duration-200"
        }
      >
        Bruhs Design System
      </a>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
        {links.map(link => {
          const isActive = link.href === current;
          return (
            <a 
              key={link.key} 
              href={link.href}
              class="group flex flex-col items-start min-w-[140px]"
              aria-current={isActive ? "page" : undefined}
            >
              <span
                class={
                  isActive
                    ? "text-4xl font-bold tracking-tighter font-krypton text-lychee-100 transition-opacity duration-200"
                    : "text-4xl font-bold tracking-tighter font-krypton text-lychee-100/40 group-hover:text-lychee-100/70 transition-opacity duration-200"
                }
              >
                {link.label}
              </span>
              <span
                class={`mt-2 text-lg max-w-xs transition-opacity duration-200 ${isActive ? "text-lychee-100" : "text-lychee-100/40 group-hover:text-lychee-100/70"}`}
              >
                {descriptions[link.key]}
              </span>
            </a>
          );
        })}
      </div>
    </header>
  );
};

export default Header;