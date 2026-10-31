import { ChallengeCard, DIFFICULTY } from '@/components/participant/challenge-card';
import { requireTeam } from '@/lib/auth/guards';
import {
  getEventState,
  listChallengeCards,
  type ChallengeCard as Card,
} from '@/lib/scoring/team-state';

const GROUPS: Card['difficulty'][] = ['easy', 'medium', 'difficult', 'main_difficult'];

export default async function DashboardPage() {
  const { teamId } = await requireTeam();
  const { status } = await getEventState();
  const cards = await listChallengeCards(teamId, status);

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-8 p-4">
      {GROUPS.map((difficulty) => {
        const group = cards.filter((card) => card.difficulty === difficulty);
        if (group.length === 0) return null;
        return (
          <section key={difficulty} aria-labelledby={difficulty} className="flex flex-col gap-3">
            <h2 id={difficulty} className="font-heading text-2xl font-bold uppercase">
              {DIFFICULTY[difficulty].label}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((card) => (
                <ChallengeCard key={card.number} card={card} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
