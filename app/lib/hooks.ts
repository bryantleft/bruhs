import { defaultChat } from "@/lib/data";
import { getChats, setChats } from "@/lib/idb";
import {
  useBruhStore,
  useCommandStore,
  useInitialStore,
  useMessageStore,
} from "@/lib/stores";
import type { Chat } from "@/lib/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const useWindowDimensions = () => {
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });

  useLayoutEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
};

export const useBruh = () => {
  const dimensions = { width: 60, height: 60 };
  const { centered, setCentered, focusPosition, setFocusPosition } =
    useBruhStore();
  const { messages } = useMessageStore();
  const { commandBarOpen } = useCommandStore();
  const windowDimensions = useWindowDimensions();
  const [position, setPosition] = useState({
    x: windowDimensions.width / 2 - dimensions.width / 2,
    y: windowDimensions.height / 2 - dimensions.height / 2,
  });
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    setCentered(messages.length < 2 && !commandBarOpen);
  }, [messages, setCentered, commandBarOpen]);

  useEffect(() => {
    function updatePosition() {
      if (centered) {
        setPosition({
          x: windowDimensions.width / 2 - dimensions.width / 2,
          y: windowDimensions.height / 2 - dimensions.height / 2,
        });
      } else {
        setPosition({ x: 12, y: 12 });
      }
    }
    updatePosition();
  }, [centered, windowDimensions.width, windowDimensions.height]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = centered
        ? (e.clientX / window.innerWidth) * 100
        : e.clientX + 16;
      const y = centered
        ? (e.clientY / window.innerHeight) * 100
        : e.clientY + 16;

      setFocusPosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [centered, setFocusPosition]);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (!isHovered) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 300);
      }
    }, 6000);

    return () => clearInterval(blinkInterval);
  }, [isHovered]);

  useEffect(() => {
    const animate = () => {
      setEyePosition((prev) => {
        const springStrength = 0.08;
        const dx = (focusPosition.x - prev.x) * springStrength;
        const dy = (focusPosition.y - prev.y) * springStrength;

        return {
          x: prev.x + dx,
          y: prev.y + dy,
        };
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [focusPosition]);

  const calculateEyePosition = () => {
    const deltaX = eyePosition.x - dimensions.width;
    const deltaY = eyePosition.y - dimensions.height;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = 4 * 30;
    const scaleFactor = distance > maxDistance ? maxDistance / distance : 1;
    const moveX = (deltaX * scaleFactor) / 15;
    const moveY = (deltaY * scaleFactor) / 15;
    const scale = 16;
    return {
      x: moveX * scale,
      y: moveY * scale,
    };
  };

  return {
    dimensions,
    position,
    eyePosition: calculateEyePosition(),
    isCentered: centered,
    isBlinking,
    isHovered,
    setIsCentered: setCentered,
    setIsBlinking,
    setIsHovered,
  };
};

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

export const useInitialScreenLoad = () => {
  const { visible, setVisible } = useInitialStore();

  useEffect(() => {
    setVisible(true);
  }, [setVisible]);

  return { visible, setVisible };
};

export const useInitialLoad = () => {
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return { isVisible, setIsVisible };
};

export const useMessageStoreSync = () => {
  const messages = useMessageStore((s) => s.messages);
  useEffect(() => {
    getChats().then((chats) => {
      if (chats && chats.length > 0) {
        useMessageStore.setState({ messages: chats[0].messages });
      }
    });
  }, []);
  useEffect(() => {
    const chat: Chat = { ...defaultChat, messages };
    setChats([chat]);
  }, [messages]);
};

export const useIsMac = () => {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.userAgent.toLowerCase().indexOf("mac") >= 0);
  }, []);

  return isMac;
};

export const useDisclosure = () => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return { isOpen, setIsOpen, ref };
};
