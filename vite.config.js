import { defineConfig } from 'vite';

export default defineConfig({
    root: 'client',
    build: {
        outDir: '../dist',
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