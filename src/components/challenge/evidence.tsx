import type { EvidenceBlock } from '@/lib/variants/generators/template';

const PRE = 'overflow-x-auto rounded-md border border-border bg-secondary p-3 font-mono text-sm';

function Block({ block, number }: { block: EvidenceBlock; number: number }) {
  switch (block.type) {
    case 'code':
      return <pre className={PRE}>{block.content}</pre>;
    case 'log':
      return <pre className={`${PRE} max-h-96 overflow-y-auto`}>{block.content}</pre>;
    case 'text':
      return <p className="whitespace-pre-wrap">{block.content}</p>;
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element -- organiser URLs, no optimiser config
      return <img src={block.url} alt={block.alt ?? 'Evidence image'} className="max-w-full" />;
    case 'file':
      return (
        <a
          href={`/api/challenges/${number}/assets/${encodeURIComponent(block.name)}`}
          className="inline-flex min-h-11 items-center text-ring underline underline-offset-4"
        >
          Download {block.label ?? block.name}
        </a>
      );
  }
}

export function Evidence({ blocks, number }: { blocks: EvidenceBlock[]; number: number }) {
  if (blocks.length === 0) return null;
  return (
    <section aria-labelledby="evidence" className="flex flex-col gap-3">
      <h2 id="evidence" className="font-heading text-2xl font-bold uppercase">
        Evidence
      </h2>
      {blocks.map((block, i) => (
        <Block key={i} block={block} number={number} />
      ))}
    </section>
  );
}
