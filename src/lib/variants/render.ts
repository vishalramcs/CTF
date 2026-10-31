import { createHash } from 'node:crypto';

export type RenderContext = {
  // null in static flag mode: only the flag's HMAC is stored, so it can't be placed in a template.
  flag: string | null;
  token: string;
  fragment: string | null;
  rng: () => number;
};

// A bad template must fail when the organiser regenerates, not show raw braces to a team.
export class TemplateError extends Error {}

// prettier-ignore
const WORDS = [
  'tangle', 'silk', 'thread', 'anchor', 'orbit', 'lantern', 'rooftop', 'signal',
  'static', 'echo', 'shadow', 'ember', 'harbor', 'copper', 'meadow', 'falcon',
];

function shiftLetters(text: string, by: number): string {
  return text.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((((c.charCodeAt(0) - base + by) % 26) + 26) % 26) + base);
  });
}

function transform(value: string, spec: string): string {
  const [name, arg] = spec.split(':');
  switch (name) {
    case 'base64':
      return Buffer.from(value, 'utf8').toString('base64');
    case 'hex':
      return Buffer.from(value, 'utf8').toString('hex');
    case 'url':
      return encodeURIComponent(value);
    case 'url2':
      return encodeURIComponent(encodeURIComponent(value));
    case 'rot13':
      return shiftLetters(value, 13);
    case 'caesar':
      if (!/^-?\d+$/.test(arg ?? '')) throw new TemplateError(`Bad transform "${spec}"`);
      return shiftLetters(value, Number(arg));
    case 'reverse':
      return [...value].reverse().join('');
    case 'sha256':
      return createHash('sha256').update(value).digest('hex');
    case 'binary':
      return [...Buffer.from(value, 'utf8')].map((b) => b.toString(2).padStart(8, '0')).join(' ');
    default:
      throw new TemplateError(`Unknown transform "${spec}"`);
  }
}

function baseValue(name: string, ctx: RenderContext): string {
  if (name === 'flag') {
    if (ctx.flag === null) throw new TemplateError('{{flag}} is not available in static flag mode');
    return ctx.flag;
  }
  if (name === 'token') return ctx.token;
  if (name === 'fragment') {
    if (ctx.fragment === null) throw new TemplateError('{{fragment}} needs a fragment challenge');
    return ctx.fragment;
  }
  if (name === 'rand_word') return WORDS[Math.floor(ctx.rng() * WORDS.length)];

  const range = name.match(/^rand:(-?\d+):(-?\d+)$/);
  if (range) {
    const [min, max] = [Number(range[1]), Number(range[2])];
    if (min > max) throw new TemplateError(`Bad range in {{${name}}}`);
    return String(min + Math.floor(ctx.rng() * (max - min + 1)));
  }
  throw new TemplateError(`Unknown placeholder {{${name}}}`);
}

// QUESTIONS_TEMPLATE.md §3. Transforms chain left to right: {{flag|rot13|base64}}.
export function render(template: string, ctx: RenderContext): string {
  return template.replace(/\{\{([^{}]*)\}\}/g, (_, expression: string) => {
    const [name, ...transforms] = expression.split('|').map((part) => part.trim());
    return transforms.reduce(transform, baseValue(name, ctx));
  });
}

export function renderDeep<T>(value: T, ctx: RenderContext): T {
  if (typeof value === 'string') return render(value, ctx) as T;
  if (Array.isArray(value)) return value.map((item) => renderDeep(item, ctx)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderDeep(item, ctx)]),
    ) as T;
  }
  return value;
}
