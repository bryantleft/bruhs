import type { FunctionComponent } from "react";

type SidebarProps = {
  current: string;
  isOpen?: boolean;
  onClose?: () => void;
};

const Sidebar: FunctionComponent<SidebarProps> = ({ current, isOpen = false, onClose }) => {
  const path = current.replace(/\/$/, "");
  const links = [
    { label: "Colors", href: "/colors", key: "colors" as const },
    { label: "Typography", href: "/typography", key: "typography" as const },
    { label: "Radius", href: "/radius", key: "radius" as const },
    { label: "Elevation", href: "/elevation", key: "elevation" as const },
    { label: "Buttons", href: "/buttons", key: "buttons" as const },
    { label: "Badges", href: "/badges", key: "badges" as const },
    { label: "Forms", href: "/forms", key: "forms" as const },
    { label: "Icons", href: "/icons", key: "icons" as const },
    { label: "Surfaces", href: "/surfaces", key: "surfaces" as const },
    { label: "Agents", href: "/agents", key: "agents" as const },
    { label: "Bruhs", href: "/bruhs", key: "bruhs" as const }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-longan-950/70 z-40 lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 w-64 h-screen border-r border-rambutan-100/5 bg-longan-950 flex flex-col z-50 transition-all duration-500 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
      <div className="p-5 border-b border-rambutan-100/5 flex items-center justify-between">
        <a
          href="/"
          className="flex items-center gap-3"
        >
          <svg viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 shrink-0">
            <circle cx="300" cy="300" r="300" fill="oklch(0.8924 0.1454 94.78)" />
            <ellipse cx="198" cy="223" rx="40" ry="10" fill="oklch(0.146 0.000 0)" />
            <ellipse cx="401" cy="223" rx="40" ry="10" fill="oklch(0.146 0.000 0)" />
            <ellipse cx="307" cy="378" rx="120" ry="10" fill="oklch(0.666 0.175 27.34)" />
          </svg>
          <span className={
            current === "/"
              ? "text-h4 font-bold tracking-tighter font-krypton text-rambutan-100"
              : "text-h4 font-bold tracking-tighter font-krypton text-rambutan-100/40 hover:text-rambutan-100/70 transition-opacity duration-200"
          }>
            Bruhs
          </span>
        </a>

        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-rambutan-100/60 hover:text-rambutan-100 hover:bg-longan-800/50 transition-all duration-300 p-2 rounded-grape active:scale-95"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <nav className="flex-1 p-5 overflow-y-auto">
        <ul className="space-y-2">
          {links.map(link => {
            const isActive = link.href === path;
            return (
              <li key={link.key}>
                <a 
                  href={link.href}
                  className="group flex flex-col p-3 rounded-lychee transition-all duration-300 hover:bg-longan-800/30 active:scale-98"
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={
                      isActive
                        ? "text-h3 sm:text-h2 font-bold tracking-tighter font-krypton text-rambutan-100 transition-all duration-300 mb-1"
                        : "text-h3 sm:text-h2 font-bold tracking-tighter font-krypton text-rambutan-100/40 group-hover:text-rambutan-100/80 transition-all duration-300 mb-1 group-hover:translate-x-1"
                    }
                  >
                    {link.label}
                  </span>
                  {isActive && (
                    <div className="w-8 h-0.5 bg-persimmon-500 rounded-orb transition-all duration-300" />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
    </>
  );
};

export default Sidebar; 