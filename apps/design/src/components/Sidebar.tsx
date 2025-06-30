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
    { label: "Bruhs", href: "/bruhs", key: "bruhs" as const }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 w-80 h-screen border-r border-lychee-100/5 bg-longan-950 flex flex-col z-50 transition-all duration-500 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
      <div className="p-4 sm:p-6 md:p-8 border-b border-lychee-100/5 flex items-center justify-between">
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
        
        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-lychee-100/60 hover:text-lychee-100 hover:bg-longan-800/50 transition-all duration-300 p-2 rounded-lg active:scale-95"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <nav className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
        <ul className="space-y-4 sm:space-y-6 md:space-y-8">
          {links.map(link => {
            const isActive = link.href === path;
            return (
              <li key={link.key}>
                <a 
                  href={link.href}
                  className="group flex flex-col p-3 rounded-xl transition-all duration-300 hover:bg-longan-800/30 active:scale-98"
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className={
                      isActive
                        ? "text-h3 sm:text-h2 font-bold tracking-tighter font-krypton text-lychee-100 transition-all duration-300 mb-1"
                        : "text-h3 sm:text-h2 font-bold tracking-tighter font-krypton text-lychee-100/40 group-hover:text-lychee-100/80 transition-all duration-300 mb-1 group-hover:translate-x-1"
                    }
                  >
                    {link.label}
                  </span>
                  {isActive && (
                    <div className="w-8 h-0.5 bg-persimmon-500 rounded-full transition-all duration-300" />
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