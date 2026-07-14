// Timeline financière : agrège tous les événements futurs (retraits de projets,
// virements annuels, augmentations, plafonds atteints, échéances, indépendance
// financière) en une liste chronologique. Module pur, testable sans DOM.

import {
	capitalNeededForRente,
	computeProjectWithdrawals,
	monthsBetween,
	projectProjection,
	simulatePortfolio,
	totalExpenses,
	type SimOptions
} from './finance';
import type { Account, IncomePlan, LifeEvent, Project, Settings, TransferRule } from './types';

export type TimelineKind =
	| 'life'
	| 'project'
	| 'transfer'
	| 'cap'
	| 'raise'
	| 'deadline'
	| 'fi';

export interface TimelineEvent {
	/** Clé stable pour le rendu. */
	id: string;
	date: Date;
	kind: TimelineKind;
	icon: string;
	title: string;
	detail?: string;
	/** Montant signé (négatif = sortie), si pertinent. */
	amount?: number;
	href?: string;
}

export interface TimelineInput {
	accounts: Account[];
	projects: Project[];
	plan: IncomePlan;
	lifeEvents: LifeEvent[];
	transferRules: TransferRule[];
	settings: Settings;
	now?: Date;
}

function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Construit la liste chronologique des événements financiers sur l'horizon donné. */
export function buildTimeline(input: TimelineInput, horizonMonths: number): TimelineEvent[] {
	const { accounts, projects, plan, lifeEvents, transferRules, settings } = input;
	const now = input.now ?? new Date();
	const start = startOfMonth(now);
	const end = new Date(start.getFullYear(), start.getMonth() + horizonMonths, 1);
	const events: TimelineEvent[] = [];
	if (accounts.length === 0) return events;

	const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
	const inRange = (d: Date) => d > now && d <= end;

	const simOpts: SimOptions = { plan, lifeEvents, transferRules, allAccounts: accounts, start: now };
	const withdrawals = computeProjectWithdrawals(projects, accounts, horizonMonths, simOpts);
	const sim = simulatePortfolio(accounts, horizonMonths, {
		...simOpts,
		lifeEvents: [...lifeEvents, ...withdrawals]
	});

	// 1. Événements de vie de l'utilisateur.
	for (const e of lifeEvents) {
		const d = new Date(e.year, (e.month || 1) - 1, 1);
		if (!inRange(d)) continue;
		events.push({
			id: `life-${e.id}`,
			date: d,
			kind: 'life',
			icon: e.amount >= 0 ? '🎉' : '💸',
			title: e.label || (e.amount >= 0 ? 'Rentrée' : 'Dépense'),
			detail: nameOf.get(e.accountId),
			amount: e.amount,
			href: '/revenus'
		});
	}

	// 2. Retraits des projets (dépense à la clôture), groupés par projet + date.
	const grouped = new Map<string, { date: Date; label: string; total: number; accounts: string[] }>();
	for (const w of withdrawals) {
		const d = new Date(w.year, (w.month || 1) - 1, 1);
		if (!inRange(d)) continue;
		const key = `${w.label}|${w.year}-${w.month}`;
		const g = grouped.get(key) ?? { date: d, label: w.label, total: 0, accounts: [] };
		g.total += w.amount;
		const nm = nameOf.get(w.accountId);
		if (nm && !g.accounts.includes(nm)) g.accounts.push(nm);
		grouped.set(key, g);
	}
	for (const [key, g] of grouped) {
		events.push({
			id: `proj-${key}`,
			date: g.date,
			kind: 'project',
			icon: '🎯',
			title: g.label,
			detail: `Retiré de ${g.accounts.join(', ')}`,
			amount: g.total,
			href: '/projets'
		});
	}

	// 3. Occurrences des règles de virement annuelles.
	for (const rule of transferRules) {
		if (!rule.enabled || rule.frequency !== 'annual') continue;
		const month = rule.month ?? 1;
		for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
			const d = new Date(y, month - 1, 1);
			if (!inRange(d)) continue;
			const from = nameOf.get(rule.fromAccountId) ?? '?';
			const to = nameOf.get(rule.toAccountId) ?? '?';
			const cap = rule.maxPctOfGrossIncome ? ` (max ${rule.maxPctOfGrossIncome} % du brut)` : '';
			events.push({
				id: `transfer-${rule.id}-${y}`,
				date: d,
				kind: 'transfer',
				icon: '🔀',
				title: rule.label || 'Virement automatique',
				detail: `${from} → ${to}${cap}`,
				href: '/comptes'
			});
		}
	}

	// 4. Augmentations de salaire.
	for (const r of plan.raises ?? []) {
		const d = new Date(r.year, 0, 1);
		if (!inRange(d)) continue;
		events.push({
			id: `raise-${r.id}`,
			date: d,
			kind: 'raise',
			icon: '💰',
			title: 'Augmentation de salaire',
			detail: `+${r.amount} €/mois`,
			amount: r.amount,
			href: '/revenus'
		});
	}

	// 5. Plafonds atteints (première date où le solde franchit le plafond).
	for (const p of sim.per) {
		const cap = p.account.cap;
		if (!cap || cap <= 0) continue;
		const hit = p.points.find((pt, i) => i > 0 && pt.balance >= cap);
		if (hit && inRange(hit.date)) {
			events.push({
				id: `cap-${p.account.id}`,
				date: hit.date,
				kind: 'cap',
				icon: '🧢',
				title: `Plafond de « ${p.account.name} »`,
				detail: p.account.overflowAccountId
					? `Débordement vers ${nameOf.get(p.account.overflowAccountId) ?? '?'}`
					: 'Plafond atteint (sans compte de débordement)',
				href: '/comptes'
			});
		}
	}

	// 6. Projets : date d'atteinte projetée + date cible.
	for (const project of projects.filter((p) => !p.completed)) {
		const proj = projectProjection(project, accounts, horizonMonths, simOpts);
		if (proj.reachedPoint && inRange(proj.reachedPoint.date)) {
			events.push({
				id: `reach-${project.id}`,
				date: proj.reachedPoint.date,
				kind: 'project',
				icon: '🏁',
				title: `Objectif atteint : ${project.name}`,
				detail: `${Math.round(project.targetAmount)} € réunis`,
				href: '/projets'
			});
		}
		if (project.targetDate) {
			const td = new Date(project.targetDate);
			if (inRange(td)) {
				events.push({
					id: `deadline-${project.id}`,
					date: td,
					kind: 'deadline',
					icon: '⏰',
					title: `Échéance : ${project.name}`,
					href: '/projets'
				});
			}
		}
	}

	// 7. Indépendance financière (capital ≥ rente couvrant les besoins).
	if (plan.enabled && totalExpenses(plan) > 0) {
		const capital = capitalNeededForRente(totalExpenses(plan), settings.withdrawalRatePct);
		const fi = sim.total.find((pt, i) => i > 0 && pt.balance >= capital);
		if (fi && inRange(fi.date)) {
			events.push({
				id: 'fi',
				date: fi.date,
				kind: 'fi',
				icon: '🏖️',
				title: 'Indépendance financière',
				detail: `Capital suffisant pour une rente couvrant vos besoins (${Math.round(capital)} €)`,
				href: '/independance'
			});
		}
	}

	return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
