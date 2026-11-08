import { Sidebar } from "@/components/sidebar";
import { TimerProvider } from "@/components/timer-context";
import { FloatingTimer } from "@/components/floating-timer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TimerProvider>
      <Sidebar />
      <main className="app-main min-h-screen">{children}</main>
      <FloatingTimer />
    </TimerProvider>
  );
}
