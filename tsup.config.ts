import { defineConfig } from 'tsup';

export default defineConfig([{
    entry: ['src/index.ts'],
    format: ['esm', 'iife'],
    dts: true,
    clean: true,
    sourcemap: true,
    globalName: 'Omnitab',
    platform: 'browser',
    outDir: 'dist'
}, {
    entry: ['src/workers/omnitab-shared-worker.ts'],
    format: ['iife'],  // Workers need IIFE format
    outDir: 'dist/workers',
    outExtension: () => ({ js: '.js' }), // Force .js extension
    clean: false,  // Don't clean between builds
    sourcemap: true,
    dts: false,    // Workers don't need .d.ts files
}]);