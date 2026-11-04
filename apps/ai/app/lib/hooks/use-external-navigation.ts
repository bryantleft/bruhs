import { useBruhStore, useInitialStore } from "@/lib/stores";

/** Fade the page out and re-centre the bruh, then leave for `link`. */
export function useExternalNavigation(): { navigate: (link: string) => void } {
  const setCentered = useBruhStore((s) => s.setCentered);
  const setVisible = useInitialStore((s) => s.setVisible);

  const navigate = (link: string): void => {
    setCentered(true);
    setVisible(false);
    setTimeout(() => {
      window.location.href = link;
    }, 1000);
  };

  return { navigate };
}
