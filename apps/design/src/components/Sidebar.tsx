import type { FunctionComponent } from "react";

type SidebarProps = {
  current: string;
};

const Sidebar: FunctionComponent<SidebarProps> = ({ current }) => {
  const path = current.replace(/\/$/, "");
  const links = [
    { label: "Colors", href: "/colors", key: "colors" as const },
    { label: "Typography", href: "/typography", key: "typography" as const },
    { label: "Branding", href: "/branding", key: "branding" as const }
  ];

  return (
    <aside className="fixed left-0 top-0 w-80 h-screen border-r border-lychee-100/5 bg-longan-950 flex flex-col">
      <div className="p-6 md:p-8 border-b border-lychee-100/5">
        <a 
          href="/"
          className={
            current === "/"
              ? "text-h3 font-bold tracking-tighter font-krypton text-lychee-100 transition-opacity duration-200"
              : "text-h3 font-bold tracking-tighter font-krypton text-lychee-100/40 hover:text-lychee-100/70 transition-opacity duration-200"
          }
        >
          Bruhs Design System
        </a>
      </div>
      
      <nav className="flex-1 p-6 md:p-8 overflow-y-auto">
        <ul className="space-y-6 md:space-y-8">
          {links.map(link => {
            const isActive = link.href === path;
            return (
              <li key={link.key}>
                <a 
                  href={link.href}
                  className="group flex flex-col"
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={
                      isActive
                        ? "text-h2 font-bold tracking-tighter font-krypton text-lychee-100 transition-opacity duration-200 mb-2"
                        : "text-h2 font-bold tracking-tighter font-krypton text-lychee-100/40 group-hover:text-lychee-100/70 transition-opacity duration-200 mb-2"
                    }
                  >
                    {link.label}
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