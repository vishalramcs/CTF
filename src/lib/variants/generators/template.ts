import { render, renderDeep, TemplateError, type RenderContext } from '@/lib/variants/render';

export type EvidenceBlock =
  | { type: 'code' | 'log' | 'text'; content: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'file'; name: string; label?: string };

export type VariantFile = { name: string; contentType?: string; content: string };

// TRD §9. Dummy clue values only: never a real token or secret.
export type Surfaces = {
  htmlComment?: string;
  metaTags?: { name: string; content: string }[];
  hiddenElements?: string[];
  jsonClue?: unknown;
  cookies?: { name: string; value: string }[];
  localStorage?: { key: string; value: string }[];
  headers?: { name: string; value: string }[];
};

export type VariantData = {
  html: string;
  evidence: EvidenceBlock[];
  surfaces: Surfaces;
  files: VariantFile[];
};

export type GeneratorInput = {
  questionTemplate: string;
  evidence: unknown;
  generatorConfig: unknown;
};

export type Generator = (challenge: GeneratorInput, ctx: RenderContext) => VariantData;

// TRD §9 isolation rule: a clue can never shadow the session cookie or a real header.
function assertSurfaceNames({ cookies = [], headers = [] }: Surfaces): void {
  for (const { name } of cookies) {
    if (!/^clue_[A-Za-z0-9_]+$/.test(name)) {
      throw new TemplateError(`Clue cookie "${name}" must be named clue_*`);
    }
  }
  for (const { name, value } of headers) {
    if (!/^x-spidey-[a-z0-9-]+$/.test(name)) {
      throw new TemplateError(`Clue header "${name}" must be named x-spidey-*`);
    }
    if (/[\r\n]/.test(value)) throw new TemplateError(`Clue header "${name}" has a line break`);
  }
}

// Reads surfaces and files from generator_config: { surfaces?, files? }.
export const templateGenerator: Generator = (challenge, ctx) => {
  const config = challenge.generatorConfig as { surfaces?: Surfaces; files?: VariantFile[] };
  const surfaces = renderDeep(config.surfaces ?? {}, ctx);
  assertSurfaceNames(surfaces);
  return {
    html: render(challenge.questionTemplate, ctx),
    evidence: renderDeep(challenge.evidence as EvidenceBlock[], ctx),
    surfaces,
    files: renderDeep(config.files ?? [], ctx),
  };
};
