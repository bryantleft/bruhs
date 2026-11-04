import { PostHogProvider } from "posthog-js/react";
import type { ReactNode } from "react";

export default function Provider({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        debug: import.meta.env.MODE === "development",
        // The settings panel holds API keys; never record what's typed into inputs.
        session_recording: { maskAllInputs: true },
      }}
    >
      {children}
    </PostHogProvider>
  );
}
