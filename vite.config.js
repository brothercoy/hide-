import { defineConfig } from 'vite';

export default defineConfig({
    root: 'client',
    // Relative asset URLs. The site serves the build at its root, where absolute /assets/… paths
    // would also work — but itch.io serves the same build from a sub-path on its own domain, where
    // an absolute path resolves to the root of itch's domain and the page comes up blank.
    base: './',
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
        // Testing a Discord Activity locally means exposing this dev server through a tunnel
        // (cloudflared / ngrok) and pointing Discord's URL mapping at the tunnel's hostname. Vite
        // refuses requests carrying a Host it doesn't recognise, so the tunnel domains have to be
        // named here or every request comes back as "Blocked request".
        // DEV SERVER ONLY — this key has no effect on any build.
        allowedHosts: ['localhost', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
        proxy: {
            '/join': 'http://localhost:3000',
            '/colyseus': 'http://localhost:3000',
            '/time': 'http://localhost:3000'
        }
    }
});