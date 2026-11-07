import { CodeSpace } from '@/components/tools/code-space';
import { requireTeam } from '@/lib/auth/guards';

export default async function ToolsPage() {
  await requireTeam();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 bg-background/90 p-4">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-4xl font-black uppercase">Code Space</h1>
        <p className="text-muted-foreground">
          Paste encoded text and chain steps: Base64, hex, XOR, shifts, binary and number bases. It
          all runs in your browser and never checks answers.
        </p>
      </header>
      <CodeSpace />
    </main>
  );
}
