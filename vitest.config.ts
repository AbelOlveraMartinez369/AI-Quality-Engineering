// Importa la configuración de Vitest
import { defineConfig } from 'vitest/config';
// Importa path para resolver rutas
import path from 'path';

// Exporta la configuración
export default defineConfig({
  // Define las opciones de resolución de módulos
  resolve: {
    // Define los alias para que coincidan con los del tsconfig.json
    alias: {
      // Alias para @utils/*
      '@utils': path.resolve(__dirname, './src/utils'),
      // Alias para @evaluators/*
      '@evaluators': path.resolve(__dirname, './src/evaluators'),
      // Alias para @agents/*
      '@agents': path.resolve(__dirname, './src/agents'),
    },
  },
  // Define las opciones de test
  test: {
    // Incluye archivos .test.ts, .spec.ts y .eval.ts
    include: ['tests/**/*.{test,spec,eval}.ts'],
  },
});