import { useBruhStore, useInitialStore } from "../stores";

export const useExternalNavigation = () => {
  const { setCentered } = useBruhStore();
  const { setVisible } = useInitialStore();

  const navigate = (link: string) => {
    setCentered(true);
    setVisible(false);
    setTimeout(() => {
      window.location.href = link;
    }, 1000);
  };

  return { navigate };
};
