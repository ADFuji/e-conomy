import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Honore la variable PORT injectée par l'environnement (preview/harness).
	server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : {},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Application 100% cliente : on génère un fallback SPA (aucun rendu serveur).
			adapter: adapter({ fallback: 'index.html' })
		})
	]
});
