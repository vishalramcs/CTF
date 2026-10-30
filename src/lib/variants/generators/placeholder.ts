export type VariantData = {
  html: string;
  evidence: unknown[];
  surfaces: Record<string, unknown>;
  files: unknown[];
};

// shortcut: fills only {{flag|base64}}, replace with render.ts when M4 builds the full renderer.
export function placeholderGenerator(questionTemplate: string, flag: string): VariantData {
  return {
    html: questionTemplate.replaceAll(
      '{{flag|base64}}',
      Buffer.from(flag, 'utf8').toString('base64'),
    ),
    evidence: [],
    surfaces: {},
    files: [],
  };
}
