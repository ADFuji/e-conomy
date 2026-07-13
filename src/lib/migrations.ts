// Migrations pures (sans dépendance navigateur) : mettent à niveau les données
// persistées d'anciennes versions vers le modèle courant. Extraites de
// store.svelte.ts pour rester testables sans environnement Svelte/DOM.

import type { Account, Project } from './types';

export function uid(): string {
	return crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayIsoMonth(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Met à niveau un compte issu d'une ancienne version. */
export function migrateAccount(a: Record<string, unknown>): Account {
	const legacyMonthly = typeof a.monthlyContribution === 'number' ? a.monthlyContribution : 0;
	const contributions = Array.isArray(a.contributions)
		? a.contributions
		: legacyMonthly > 0
			? [{ id: uid(), amount: legacyMonthly, frequency: 'monthly' as const }]
			: [];
	return {
		...(a as unknown as Account),
		contributions,
		compounding: (a.compounding as Account['compounding']) ?? 'annual',
		extrapolateRates: typeof a.extrapolateRates === 'boolean' ? a.extrapolateRates : true,
		ratesByYear: (a.ratesByYear as Record<number, number>) ?? {},
		defaultRate: typeof a.defaultRate === 'number' ? a.defaultRate : 0,
		cap: typeof a.cap === 'number' && a.cap > 0 ? a.cap : undefined,
		overflowAccountId: typeof a.overflowAccountId === 'string' ? a.overflowAccountId : undefined,
		taxable: typeof a.taxable === 'boolean' ? a.taxable : false,
		taxRatePct: typeof a.taxRatePct === 'number' ? a.taxRatePct : 30,
		// Le solde est réputé daté d'aujourd'hui s'il n'a jamais été explicitement
		// daté (compte créé avant l'introduction des soldes datés).
		balanceDate:
			typeof a.balanceDate === 'string' && a.balanceDate
				? a.balanceDate
				: typeof a.createdAt === 'string' && a.createdAt
					? `${a.createdAt.slice(0, 7)}-01`
					: todayIsoMonth()
	};
}

/** Met à niveau un projet issu d'une ancienne version (pas de jalons atteints). */
export function migrateProject(p: Record<string, unknown>): Project {
	return {
		...(p as unknown as Project),
		milestonesAchieved: (p.milestonesAchieved as Project['milestonesAchieved']) ?? {}
	};
}
