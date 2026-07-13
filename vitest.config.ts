import { defineConfig } from 'vitest/config';

// Config Vitest dédiée et minimale : le cœur métier testé (finance.ts,
// migrations.ts, crypto.ts) est du TypeScript pur sans dépendance à Svelte ou
// à $app/*, donc pas besoin du plugin SvelteKit ici.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts']
	}
});
