import path from 'path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [svelte()],
    // Relative asset URLs so the built HTML works inside vscode-resource: webviews
    base: './',
    build: {
        // Avoid modulepreload polyfill that issues extra fetches in the webview
        modulePreload: false,
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                'signal-lab': path.resolve(__dirname, 'signal-lab.html'),
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',
            },
        },
        // Single bundle — no code splitting (required for VS Code webviews)
        cssCodeSplit: false,
    },
});
