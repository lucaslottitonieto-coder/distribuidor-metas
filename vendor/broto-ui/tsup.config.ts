import { defineConfig } from 'tsup';

const common = {
  format: ['esm', 'cjs'] as const,
  dts: true,
  sourcemap: true,
  target: 'es2020',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
};

export default defineConfig([
  {
    ...common,
    entry: { index: 'src/index.ts' },
    clean: true,
    // Os componentes usam hooks: marca o bundle como client component (Next.js App Router).
    banner: { js: '"use client";' },
  },
  {
    ...common,
    // Funções puras (formatação, classes, tons) para Server Components: sem "use client".
    entry: { utils: 'src/utils.ts' },
    clean: false,
  },
]);
