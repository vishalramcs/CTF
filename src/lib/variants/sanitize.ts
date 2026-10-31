// TRD §9 allow-list. Authors are trusted organisers, so this is defence in depth, and every tag is
// rebuilt from parsed parts rather than passed through.
// shortcut: regex tokeniser, not a full HTML parser. Move to a parser library if untrusted people
// can ever write challenge HTML.
const TAGS = new Set(
  `a abbr b blockquote br code dd details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img
   kbd li mark meta ol p pre s samp section small span strong sub summary sup table tbody td template
   th thead tr u ul`.split(/\s+/),
);
const ATTRS = new Set(
  `alt class colspan content height hidden href id lang name rel role rowspan src target title
   width`.split(/\s+/),
);
const SAFE_URL = /^(https?:|mailto:|\/|#|\.)/i;

const TOKEN = /<!--([\s\S]*?)-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|</g;
const ATTR = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function cleanAttrs(raw: string): string {
  let out = '';
  for (const [, rawName, dq, sq, bare] of raw.matchAll(ATTR)) {
    const name = rawName.toLowerCase();
    if (!ATTRS.has(name) && !/^(data|aria)-[a-z0-9-]+$/.test(name)) continue;
    const value = dq ?? sq ?? bare ?? '';
    if ((name === 'href' || name === 'src') && !SAFE_URL.test(value.trim())) continue;
    out += ` ${name}="${value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
  }
  return out;
}

export function sanitizeHtml(html: string): string {
  return html.replace(TOKEN, (match, comment, slash, tag, attrs) => {
    if (comment !== undefined) {
      // Browsers end a comment early on these, which would expose what follows as live markup.
      return /^-?>|--!>/.test(comment) ? '' : match;
    }
    if (!tag) return '&lt;';
    const name = tag.toLowerCase();
    if (!TAGS.has(name)) return '';
    return slash ? `</${name}>` : `<${name}${cleanAttrs(attrs)}>`;
  });
}

// For a surface value placed inside <!-- -->: without a ">" it can't close the comment.
export function commentSafe(text: string): string {
  return text.replace(/>/g, '&gt;');
}

// For a JSON block inside <script type="application/json">: "<" could close the script element.
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
