import { useEffect } from "react";
import { useInitialStore } from "../stores";

export const useInitialScreenLoad = () => {
  const { visible, setVisible } = useInitialStore();

  useEffect(() => {
    setVisible(true);
  }, [setVisible]);

  return { visible, setVisible };
};
