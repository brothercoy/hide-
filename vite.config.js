import { defineConfig } from 'vite';

export default defineConfig({
    root: 'client',
    build: {
        outDir: '../dist',
        // dist/ sits outside the Vite root, so it is NOT wiped unless we say so — without this
        // every build piles another hashed bundle in there. That matters for deployment: the old
        // bundles include ones built before the dev tools were stripped, and uploading the folder
        // would ship them all.
        emptyOutDir: true,
        rollupOptions: {
            input: 'client/index.html'
        }
    },
    server: {
        proxy: {
            '/join': 'http://localhost:3000',
            '/colyseus': 'http://localhost:3000'
        }
    }
});