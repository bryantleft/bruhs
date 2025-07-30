import { useState, type FunctionComponent } from "react";
import Sidebar from "./Sidebar";

type MobileMenuToggleProps = {
  current: string;
};

const MobileMenuToggle: FunctionComponent<MobileMenuToggleProps> = ({ current }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={toggleMenu}
        className="fixed top-4 left-4 z-50 lg:hidden bg-longan-900 border border-rambutan-100/10 rounded-xl p-3 text-rambutan-100/80 hover:text-rambutan-100 hover:bg-longan-800 transition-all duration-300 active:scale-95"
        aria-label="Toggle menu"
      >
        <svg 
          className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Sidebar with mobile state */}
      <Sidebar current={current} isOpen={isOpen} onClose={closeMenu} />
    </>
  );
};

export default MobileMenuToggle;