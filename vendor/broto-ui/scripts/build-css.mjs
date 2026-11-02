// Gera os arquivos CSS publicados em dist/ a partir de src/styles.
// styles.css = tokens + base + componentes (experiência completa).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(root, 'src/styles', f), 'utf8').trim();
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

const COMPONENT_FILES = ['components.css', 'forms.css', 'data.css', 'overlays.css', 'layout.css', 'patterns.css'];
const header = (name) => `/* broto-ui · ${name} */\n`;

const tokens = src('tokens.css');
const base = src('base.css');
const components = COMPONENT_FILES.map(src).join('\n\n');

writeFileSync(join(out, 'tokens.css'), header('tokens') + tokens + '\n');
writeFileSync(join(out, 'base.css'), header('base') + base + '\n');
writeFileSync(join(out, 'components.css'), header('components') + components + '\n');
writeFileSync(join(out, 'fonts.css'), header('fonts') + src('fonts.css') + '\n');
writeFileSync(join(out, 'styles.css'), header('tokens + base + components') + [tokens, base, components].join('\n\n') + '\n');

console.log('CSS gerado em dist/: styles.css, tokens.css, base.css, components.css, fonts.css');
