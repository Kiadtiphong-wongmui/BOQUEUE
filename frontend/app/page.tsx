import { QueueDashboard } from "./components/QueueDashboard";

export default function Home() {
  return (
    <main className="flex-1 bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <QueueDashboard />
    </main>
  );
}
