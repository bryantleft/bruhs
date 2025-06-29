import type { FunctionComponent } from "preact";

type SidebarProps = {
  current: string;
};

const descriptions = {
  colors: "The color palette.",
  typography: "The typographic scale and fonts."
} as const;

const Sidebar: FunctionComponent<SidebarProps> = ({ current }) => {
  const path = current.replace(/\/$/, "");
  const links = [
    { label: "Colors", href: "/colors", key: "colors" as const },
    { label: "Typography", href: "/typography", key: "typography" as const }
  ];

  return (
    <aside class="fixed left-0 top-0 w-80 h-screen border-r border-lychee-100/5 bg-longan-950 flex flex-col">
      <div class="p-8 border-b border-lychee-100/5">
        <a 
          href="/"
          class={
            current === "/"
              ? "text-xl font-bold tracking-tighter font-krypton text-lychee-100 transition-opacity duration-200"
              : "text-xl font-bold tracking-tighter font-krypton text-lychee-100/40 hover:text-lychee-100/70 transition-opacity duration-200"
          }
        >
          Bruhs Design System
        </a>
      </div>
      
      <nav class="flex-1 p-8 overflow-y-auto">
        <ul class="space-y-8">
          {links.map(link => {
            const isActive = link.href === path;
            return (
              <li key={link.key}>
                <a 
                  href={link.href}
                  class="group flex flex-col"
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    class={
                      isActive
                        ? "text-2xl font-bold tracking-tighter font-krypton text-lychee-100 transition-opacity duration-200 mb-2"
                        : "text-2xl font-bold tracking-tighter font-krypton text-lychee-100/40 group-hover:text-lychee-100/70 transition-opacity duration-200 mb-2"
                    }
                  >
                    {link.label}
                  </span>
                  <span
                    class={`text-sm leading-relaxed transition-opacity duration-200 ${isActive ? "text-lychee-100/80" : "text-lychee-100/40 group-hover:text-lychee-100/60"}`}
                  >
                    {descriptions[link.key]}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar; 