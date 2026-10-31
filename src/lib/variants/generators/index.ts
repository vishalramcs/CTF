import { TemplateError } from '@/lib/variants/render';
import { placeholderGenerator } from './placeholder';
import { templateGenerator, type Generator } from './template';

// M8 adds exif-image, log-file and text-file.
const generators: Record<string, Generator> = {
  template: templateGenerator,
  placeholder: placeholderGenerator,
};

export function getGenerator(key: string): Generator {
  const generator = generators[key];
  if (!generator) throw new TemplateError(`Generator "${key}" isn't available`);
  return generator;
}
