// Moteur d'insights : inspecte données + simulation pour remonter des conseils
// actionnables. Module pur (aucune dépendance DOM/store) : les formateurs de
// montants/dates sont injectés, ce qui garde la devise de l'utilisateur tout en
// restant testable sous Vitest.

import {
	computeProjectWithdrawals,
	monthlyBudgetAt,
	projectProjection,
	rateForYear,
	simulatePortfolio,
	totalExpenses,
	type SimOptions
} from './finance';
import type { Account, IncomePlan, LifeEvent, Project, Snapshot, TransferRule } from './types';

export type InsightSeverity = 'critical' | 'warning' | 'info';

export interface Insight {
	id: string;
	severity: InsightSeverity;
	icon: string;
	title: string;
	detail: string;
	href?: string;
}

export interface InsightInput {
	accounts: Account[];
	projects: Project[];
	plan: IncomePlan;
	lifeEvents: LifeEvent[];
	transferRules: TransferRule[];
	snapshots: Snapshot[];
	now?: Date;
}

export interface InsightFormatters {
	money: (n: number) => string;
	monthYear: (d: Date) => string;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };

function monthsAgo(iso: string, now: Date): number {
	const d = new Date(iso);
	return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

/** Analyse le patrimoine et sa projection pour produire des conseils, triés par gravité. */
export function computeInsights(input: InsightInput, fmt: InsightFormatters): Insight[] {
	const { accounts, projects, plan, lifeEvents, transferRules, snapshots } = input;
	const now = input.now ?? new Date();
	const insights: Insight[] = [];
	if (accounts.length === 0) return insights;

	const horizonMonths = 24;
	const simOpts: SimOptions = { plan, lifeEvents, transferRules, allAccounts: accounts, start: now };
	const withdrawals = computeProjectWithdrawals(projects, accounts, horizonMonths, simOpts);
	const sim = simulatePortfolio(accounts, horizonMonths, {
		...simOpts,
		lifeEvents: [...lifeEvents, ...withdrawals]
	});

	// 1. Compte à découvert dans la projection.
	let earliest: { name: string; date: Date; balance: number } | null = null;
	for (const p of sim.per) {
		const hit = p.points.find((pt) => pt.balance < -1);
		if (hit && (!earliest || hit.date < earliest.date)) {
			earliest = { name: p.account.name, date: hit.date, balance: hit.balance };
		}
	}
	if (earliest) {
		insights.push({
			id: 'overdraft',
			severity: 'critical',
			icon: '🔴',
			title: `« ${earliest.name} » passe à découvert`,
			detail: `Solde négatif dès ${fmt.monthYear(earliest.date)} (${fmt.money(earliest.balance)}) au rythme actuel.`,
			href: '/simulations'
		});
	}

	// 2. Budget intenable : l'épargne programmée dépasse le surplus.
	if (plan.enabled) {
		const budget = monthlyBudgetAt(plan, accounts, 0, now);
		if (budget.remaining < -1) {
			insights.push({
				id: 'budget',
				severity: 'critical',
				icon: '⚖️',
				title: 'Budget mensuel intenable',
				detail: `Tu programmes ${fmt.money(budget.totalSavings)} d'épargne pour ${fmt.money(budget.income - budget.expenses)} de surplus : il manque ${fmt.money(-budget.remaining)} par mois.`,
				href: '/revenus'
			});
		}
	}

	// 3. Plafond atteint sans compte de débordement.
	for (const p of sim.per) {
		const cap = p.account.cap;
		if (!cap || cap <= 0 || p.account.overflowAccountId) continue;
		const reaches = p.points.some((pt) => pt.balance >= cap * 0.98);
		if (reaches) {
			insights.push({
				id: `cap-${p.account.id}`,
				severity: 'warning',
				icon: '🧢',
				title: `« ${p.account.name} » approche son plafond`,
				detail: `Le plafond de ${fmt.money(cap)} sera atteint sans compte de débordement : l'excédent ne fructifiera plus.`,
				href: '/comptes'
			});
		}
	}

	// 4. Projets en retard sur leur date cible.
	const projHorizon = Math.max(horizonMonths, 120);
	const lateProjects = projects
		.filter((p) => !p.completed && p.targetDate)
		.filter((p) => {
			const proj = projectProjection(p, accounts, projHorizon, simOpts);
			if (proj.alreadyReached) return false;
			return !proj.reachedPoint || new Date(proj.reachedPoint.date) > new Date(p.targetDate!);
		});
	if (lateProjects.length > 0) {
		insights.push({
			id: 'late-projects',
			severity: 'warning',
			icon: '⏰',
			title: `${lateProjects.length} projet${lateProjects.length > 1 ? 's' : ''} en retard`,
			detail: `Au rythme actuel, ${lateProjects.map((p) => p.name).join(', ')} ${lateProjects.length > 1 ? 'seront atteints' : 'sera atteint'} après la date cible.`,
			href: '/projets'
		});
	}

	// 5. Argent dormant sur des comptes non rémunérés.
	const idleBalance = accounts
		.filter((a) => a.type === 'courant' || a.type === 'especes')
		.reduce((s, a) => s + a.balance, 0);
	const idleThreshold = plan.enabled ? totalExpenses(plan) * 3 : 3000;
	const hasYieldAccount = accounts.some((a) => a.hasYield);
	if (idleBalance > idleThreshold && idleThreshold > 0 && hasYieldAccount) {
		insights.push({
			id: 'idle-cash',
			severity: 'info',
			icon: '💤',
			title: 'Argent dormant',
			detail: `${fmt.money(idleBalance)} sur des comptes non rémunérés — une partie pourrait rejoindre un compte qui rapporte.`,
			href: '/comptes'
		});
	}

	// 6. Pointage ancien (remplace l'ancien encart du dashboard).
	const lastSnapshot = [...snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
	const sincePointage = lastSnapshot ? monthsAgo(lastSnapshot.date, now) : null;
	if (sincePointage === null) {
		insights.push({
			id: 'no-pointage',
			severity: 'info',
			icon: '📍',
			title: 'Aucun pointage enregistré',
			detail: 'Comparez vos projections au réel en saisissant vos soldes du mois.',
			href: '/pointage'
		});
	} else if (sincePointage >= 2) {
		insights.push({
			id: 'old-pointage',
			severity: 'info',
			icon: '📍',
			title: 'Pointage à mettre à jour',
			detail: `Dernier pointage il y a ${sincePointage} mois (${fmt.monthYear(new Date(lastSnapshot!.date))}).`,
			href: '/pointage'
		});
	}

	// 7. Compte à rendement sans taux pris en compte cette année.
	const noRate = accounts.filter((a) => a.hasYield && rateForYear(a, now.getFullYear()) === 0);
	if (noRate.length > 0) {
		insights.push({
			id: 'no-rate',
			severity: 'info',
			icon: '📉',
			title: `Rendement à 0 % pour ${noRate.length} compte${noRate.length > 1 ? 's' : ''}`,
			detail: `${noRate.map((a) => a.name).join(', ')} ne génère aucun intérêt faute de taux renseigné pour ${now.getFullYear()}.`,
			href: '/comptes'
		});
	}

	// 8. Solde périmé (jamais pointé/mis à jour depuis longtemps).
	const stale = accounts.filter((a) => a.balanceDate && monthsAgo(a.balanceDate, now) >= 3);
	if (stale.length > 0) {
		insights.push({
			id: 'stale-balance',
			severity: 'info',
			icon: '📅',
			title: `${stale.length} solde${stale.length > 1 ? 's' : ''} ancien${stale.length > 1 ? 's' : ''}`,
			detail: `${stale.map((a) => a.name).join(', ')} ${stale.length > 1 ? 'datent' : 'date'} d'il y a 3 mois ou plus — un pointage remettrait les chiffres à jour.`,
			href: '/pointage'
		});
	}

	return insights.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
