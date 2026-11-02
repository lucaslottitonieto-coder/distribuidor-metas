import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const src = fileURLToPath(new URL('../src', import.meta.url));

// Catálogo da lib. Importa direto de src/ (sem build) para editar e ver na hora.
// SINGLE=1 gera um único index.html com tudo embutido (útil para publicar o catálogo).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), ...(process.env.SINGLE === '1' ? [viteSingleFile()] : [])],
  resolve: {
    alias: [
      { find: /^broto-ui$/, replacement: `${src}/index.ts` },
      { find: /^broto-ui\/styles\.css$/, replacement: fileURLToPath(new URL('./styles.css', import.meta.url)) },
    ],
  },
  server: { port: 5180 },
  build: { outDir: 'dist', emptyOutDir: true },
});
