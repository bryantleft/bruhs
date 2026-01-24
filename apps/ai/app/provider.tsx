import { PostHogProvider } from "posthog-js/react";

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        debug: import.meta.env.MODE === "development",
      }}
    >
      {children}
    </PostHogProvider>
  );
}
