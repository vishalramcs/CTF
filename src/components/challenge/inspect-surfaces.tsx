import type { Surfaces } from '@/lib/variants/generators/template';
import { commentSafe, jsonForScript, sanitizeHtml } from '@/lib/variants/sanitize';

// TRD §9: invisible, but there in View Source and DevTools, on purpose. Dummy clue values only.
export function InspectSurfaces({ surfaces }: { surfaces: Surfaces }) {
  const { htmlComment, metaTags, hiddenElements, jsonClue, cookies, localStorage } = surfaces;
  const hasWrites = Boolean(cookies?.length || localStorage?.length);

  return (
    <>
      {htmlComment && (
        <div hidden dangerouslySetInnerHTML={{ __html: `<!-- ${commentSafe(htmlComment)} -->` }} />
      )}
      {metaTags?.map((tag) => (
        <meta key={tag.name} name={tag.name} content={tag.content} />
      ))}
      {hiddenElements?.map((html, i) => (
        <div key={i} hidden dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
      ))}
      {jsonClue !== undefined && (
        <script
          id="clue"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: jsonForScript(jsonClue) }}
        />
      )}
      {hasWrites && (
        <>
          <script
            id="clue-writes"
            type="application/json"
            dangerouslySetInnerHTML={{ __html: jsonForScript({ cookies, localStorage }) }}
          />
          {/* Not async: React would hoist it above the block it reads. */}
          <script src="/challenges/clue.js" defer />
        </>
      )}
    </>
  );
}
