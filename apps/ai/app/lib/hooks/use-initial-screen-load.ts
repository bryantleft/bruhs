import { useEffect } from "react";
import { useInitialStore } from "@/lib/stores";

/** Fade the page in after the first client render. */
export function useInitialScreenLoad(): { visible: boolean } {
  const visible = useInitialStore((s) => s.visible);
  const setVisible = useInitialStore((s) => s.setVisible);

  useEffect(() => {
    setVisible(true);
  }, [setVisible]);

  return { visible };
}
