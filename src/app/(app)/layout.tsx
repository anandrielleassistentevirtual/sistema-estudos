import { Sidebar } from "@/components/sidebar";
import { TimerProvider } from "@/components/timer-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TimerProvider>
      <Sidebar />
      <main className="md:pl-60 min-h-screen">{children}</main>
    </TimerProvider>
  );
}
