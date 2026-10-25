import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useVisualSettings } from "@/components/visual-settings";

function VisualSettingsApplier({ children }: { children: React.ReactNode }) {
  const { opacity, blur, borderRadius } = useVisualSettings();
  useEffect(() => {
    document.documentElement.style.setProperty("--visual-opacity", String(opacity / 100));
    document.documentElement.style.setProperty("--visual-blur", `${blur}px`);
    document.documentElement.style.setProperty("--visual-radius", `${borderRadius}px`);
  }, [opacity, blur, borderRadius]);
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <VisualSettingsApplier>
          {children}
          <Toaster richColors position="top-center" />
        </VisualSettingsApplier>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
