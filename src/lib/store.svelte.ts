// État global de l'application, persisté dans le navigateur (localStorage).
// 100% local : aucune donnée ne quitte la machine.

import { browser } from '$app/environment';
import {
	createDefaultIncomePlan,
	DEFAULT_SETTINGS,
	MILESTONE_FRACTIONS,
	MILESTONE_KEYS,
	starterExpenses,
	type Account,
	type IncomePlan,
	type LifeEvent,
	type Project,
	type Settings,
	type Snapshot,
	type TransferRule
} from './types';
import { catchUpAccounts, distributeWithdrawal, monthlyEquivalent, monthlyInvestableAt, withdrawalOrder } from './finance';
import { migrateAccount, migrateProject } from './migrations';

const KEYS = {
	accounts: 'econ.accounts',
	projects: 'econ.projects',
	settings: 'econ.settings',
	income: 'econ.income',
	theme: 'econ.theme',
	lifeEvents: 'econ.lifeEvents',
	snapshots: 'econ.snapshots',
	transferRules: 'econ.transferRules'
};

export type Theme = 'light' | 'dark' | 'system';

function load<T>(key: string, fallback: T): T {
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function uid(): string {
	return crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Met à niveau un plan de revenus (ancien format : besoins vitaux en un seul montant). */
function migrateIncomePlan(raw: Record<string, unknown>): IncomePlan {
	const plan = { ...createDefaultIncomePlan(), ...raw } as IncomePlan & {
		essentialExpenses?: number;
	};
	if (!Array.isArray(plan.expenses)) {
		const legacy = typeof plan.essentialExpenses === 'number' ? plan.essentialExpenses : null;
		plan.expenses =
			legacy !== null ? [{ id: uid(), label: 'Besoins vitaux', amount: legacy }] : starterExpenses();
	}
	delete plan.essentialExpenses;
	return plan;
}

export const PALETTE = [
	'#6366f1',
	'#10b981',
	'#f59e0b',
	'#ef4444',
	'#06b6d4',
	'#8b5cf6',
	'#ec4899',
	'#84cc16',
	'#f97316',
	'#14b8a6'
];

class AppStore {
	accounts = $state<Account[]>(load<Record<string, unknown>[]>(KEYS.accounts, []).map(migrateAccount));
	projects = $state<Project[]>(load<Record<string, unknown>[]>(KEYS.projects, []).map(migrateProject));
	settings = $state<Settings>({ ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) });
	incomePlan = $state<IncomePlan>(migrateIncomePlan(load(KEYS.income, {})));
	lifeEvents = $state<LifeEvent[]>(load(KEYS.lifeEvents, []));
	snapshots = $state<Snapshot[]>(load(KEYS.snapshots, []));
	transferRules = $state<TransferRule[]>(load(KEYS.transferRules, []));
	theme = $state<Theme>(load<Theme>(KEYS.theme, 'system'));

	constructor() {
		if (browser) {
			// Persistance automatique : $state est profondément réactif, l'effet se
			// re-déclenche à chaque mutation (y compris imbriquée).
			$effect.root(() => {
				$effect(() => localStorage.setItem(KEYS.accounts, JSON.stringify(this.accounts)));
				$effect(() => localStorage.setItem(KEYS.projects, JSON.stringify(this.projects)));
				$effect(() => localStorage.setItem(KEYS.settings, JSON.stringify(this.settings)));
				$effect(() => localStorage.setItem(KEYS.income, JSON.stringify(this.incomePlan)));
				$effect(() => localStorage.setItem(KEYS.lifeEvents, JSON.stringify(this.lifeEvents)));
				$effect(() => localStorage.setItem(KEYS.snapshots, JSON.stringify(this.snapshots)));
				$effect(() => localStorage.setItem(KEYS.transferRules, JSON.stringify(this.transferRules)));
				$effect(() => {
					localStorage.setItem(KEYS.theme, this.theme);
					this.applyTheme();
				});
			});
			this.applyTheme();
		}
	}

	applyTheme() {
		if (!browser) return;
		const resolved =
			this.theme === 'system'
				? window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: this.theme;
		document.documentElement.dataset.theme = resolved;
	}

	// ----- Comptes -------------------------------------------------------------

	nextColor(): string {
		const used = new Set([...this.accounts, ...this.projects].map((x) => x.color));
		return PALETTE.find((c) => !used.has(c)) ?? PALETTE[this.accounts.length % PALETTE.length];
	}

	addAccount(data: Omit<Account, 'id' | 'createdAt'>): Account {
		const account: Account = { ...data, id: uid(), createdAt: new Date().toISOString() };
		this.accounts.push(account);
		return account;
	}

	updateAccount(id: string, patch: Partial<Account>) {
		const i = this.accounts.findIndex((a) => a.id === id);
		if (i >= 0) this.accounts[i] = { ...this.accounts[i], ...patch };
	}

	removeAccount(id: string) {
		this.accounts = this.accounts.filter((a) => a.id !== id);
		// Nettoie les références dans les projets.
		for (const p of this.projects) {
			p.fundingAccountIds = p.fundingAccountIds.filter((x) => x !== id);
		}
	}

	getAccount(id: string): Account | undefined {
		return this.accounts.find((a) => a.id === id);
	}

	// ----- Projets -------------------------------------------------------------

	addProject(data: Omit<Project, 'id' | 'createdAt'>): Project {
		const project: Project = { ...data, id: uid(), createdAt: new Date().toISOString() };
		this.projects.push(project);
		return project;
	}

	updateProject(id: string, patch: Partial<Project>) {
		const i = this.projects.findIndex((p) => p.id === id);
		if (i >= 0) this.projects[i] = { ...this.projects[i], ...patch };
	}

	removeProject(id: string) {
		this.projects = this.projects.filter((p) => p.id !== id);
	}

	/**
	 * Marque un projet comme terminé et retire son montant des comptes qui le
	 * financent : le but d'un projet est d'être dépensé, pas de fructifier
	 * indéfiniment. Le retrait suit `withdrawalOrder` (compte courant en premier,
	 * puis PEE > Livret > PEA pour l'immobilier, sinon du moins au plus rémunérateur).
	 * Rattrape d'abord les soldes à aujourd'hui pour débiter des montants à jour.
	 */
	completeProject(id: string) {
		const p = this.projects.find((x) => x.id === id);
		if (!p || p.completed) return;

		const fundingAccounts = p.fundingAccountIds.length
			? this.accounts.filter((a) => p.fundingAccountIds.includes(a.id))
			: this.accounts;
		const caughtUp = catchUpAccounts(fundingAccounts, new Date(), this.lifeEvents);
		const ordered = withdrawalOrder(p, caughtUp, new Date().getFullYear());
		const available = ordered.reduce((s, a) => s + a.balance, 0);
		const amount = Math.min(p.targetAmount, available);
		const withdrawals = distributeWithdrawal(amount, ordered);

		const todayIso = (() => {
			const d = new Date();
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
		})();
		for (const [accountId, amt] of Object.entries(withdrawals)) {
			const caught = caughtUp.find((a) => a.id === accountId);
			if (!caught) continue;
			this.updateAccount(accountId, { balance: caught.balance - amt, balanceDate: todayIso });
		}

		this.updateProject(id, {
			completed: true,
			completedDate: new Date().toISOString(),
			withdrawals
		});
	}

	/** Réouvre un projet clôturé par erreur (ne restitue PAS l'argent déjà retiré). */
	reopenProject(id: string) {
		this.updateProject(id, { completed: false, completedDate: undefined, withdrawals: undefined });
	}

	/** Priorité = ordre du tableau (index 0 = priorité la plus haute). */
	// Ne réordonne qu'au sein du même statut (actif / terminé), pour qu'un projet
	// terminé interposé dans le tableau ne perturbe pas la priorité des actifs.
	moveProjectUp(id: string) {
		const i = this.projects.findIndex((p) => p.id === id);
		if (i <= 0) return;
		const completed = this.projects[i].completed;
		for (let j = i - 1; j >= 0; j--) {
			if (!!this.projects[j].completed === !!completed) {
				const arr = [...this.projects];
				[arr[j], arr[i]] = [arr[i], arr[j]];
				this.projects = arr;
				return;
			}
		}
	}

	moveProjectDown(id: string) {
		const i = this.projects.findIndex((p) => p.id === id);
		if (i < 0) return;
		const completed = this.projects[i].completed;
		for (let j = i + 1; j < this.projects.length; j++) {
			if (!!this.projects[j].completed === !!completed) {
				const arr = [...this.projects];
				[arr[j], arr[i]] = [arr[i], arr[j]];
				this.projects = arr;
				return;
			}
		}
	}

	// ----- Événements de vie ----------------------------------------------------

	addLifeEvent(data: Omit<LifeEvent, 'id'>): LifeEvent {
		const event: LifeEvent = { ...data, id: uid() };
		this.lifeEvents.push(event);
		return event;
	}

	updateLifeEvent(id: string, patch: Partial<LifeEvent>) {
		const i = this.lifeEvents.findIndex((e) => e.id === id);
		if (i >= 0) this.lifeEvents[i] = { ...this.lifeEvents[i], ...patch };
	}

	removeLifeEvent(id: string) {
		this.lifeEvents = this.lifeEvents.filter((e) => e.id !== id);
	}

	// ----- Règles de virement -----------------------------------------------------

	addTransferRule(data: Omit<TransferRule, 'id'>): TransferRule {
		const rule: TransferRule = { ...data, id: uid() };
		this.transferRules.push(rule);
		return rule;
	}

	updateTransferRule(id: string, patch: Partial<TransferRule>) {
		const i = this.transferRules.findIndex((r) => r.id === id);
		if (i >= 0) this.transferRules[i] = { ...this.transferRules[i], ...patch };
	}

	removeTransferRule(id: string) {
		this.transferRules = this.transferRules.filter((r) => r.id !== id);
	}

	// ----- Pointages (snapshots) -------------------------------------------------

	upsertSnapshot(date: string, balances: Record<string, number>) {
		const i = this.snapshots.findIndex((s) => s.date === date);
		if (i >= 0) this.snapshots[i] = { ...this.snapshots[i], balances };
		else this.snapshots = [...this.snapshots, { id: uid(), date, balances }].sort((a, b) =>
			a.date.localeCompare(b.date)
		);
		this.recomputeMilestones();
	}

	removeSnapshot(id: string) {
		this.snapshots = this.snapshots.filter((s) => s.id !== id);
		this.recomputeMilestones();
	}

	/**
	 * Reporte les soldes d'un pointage sur les comptes correspondants (et date le
	 * solde au mois du pointage). Réservé au pointage le plus récent : un pointage
	 * plus ancien que le dernier ne doit pas faire régresser un compte.
	 */
	syncBalancesFromSnapshot(snapshotId: string) {
		const snap = this.snapshots.find((s) => s.id === snapshotId);
		if (!snap) return;
		const latest = [...this.snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
		if (!latest || latest.id !== snap.id) return;
		for (const a of this.accounts) {
			const bal = snap.balances[a.id];
			if (bal !== undefined) this.updateAccount(a.id, { balance: bal, balanceDate: snap.date });
		}
	}

	/**
	 * Recalcule, pour chaque projet, la première date de pointage à laquelle
	 * chaque jalon (25/50/75/100 %) a réellement été atteint. Source de vérité
	 * unique : les pointages actuels (un jalon sans pointage à l'appui est effacé).
	 */
	recomputeMilestones() {
		const sorted = [...this.snapshots].sort((a, b) => a.date.localeCompare(b.date));
		for (const p of this.projects) {
			const fundingIds = p.fundingAccountIds.length ? p.fundingAccountIds : this.accounts.map((a) => a.id);
			const achieved: NonNullable<Project['milestonesAchieved']> = {};
			for (const key of MILESTONE_KEYS) {
				const frac = MILESTONE_FRACTIONS[MILESTONE_KEYS.indexOf(key)];
				const threshold = p.targetAmount * frac;
				const hit = sorted.find(
					(snap) => fundingIds.reduce((s, id) => s + (snap.balances[id] ?? 0), 0) >= threshold
				);
				if (hit) achieved[key] = hit.date;
			}
			if (JSON.stringify(achieved) !== JSON.stringify(p.milestonesAchieved ?? {})) {
				this.updateProject(p.id, { milestonesAchieved: achieved });
			}
		}
	}

	// ----- Dérivés -------------------------------------------------------------

	get totalBalance(): number {
		return this.accounts.reduce((s, a) => s + a.balance, 0);
	}

	/** Versements programmés fixes (équivalent mensuel), hors plan de revenus. */
	get fixedMonthlySavings(): number {
		return this.accounts.reduce((s, a) => s + monthlyEquivalent(a), 0);
	}

	/** Capacité d'épargne mensuelle actuelle issue du plan de revenus. */
	get incomeMonthlySavings(): number {
		return monthlyInvestableAt(this.incomePlan, 0, new Date());
	}

	/** Épargne mensuelle totale actuelle (versements fixes + plan de revenus). */
	get monthlySavings(): number {
		return this.fixedMonthlySavings + this.incomeMonthlySavings;
	}

	// ----- Import / Export -----------------------------------------------------

	exportData(): string {
		return JSON.stringify(
			{
				version: 1,
				exportedAt: new Date().toISOString(),
				accounts: this.accounts,
				projects: this.projects,
				settings: this.settings,
				incomePlan: this.incomePlan,
				lifeEvents: this.lifeEvents,
				snapshots: this.snapshots,
				transferRules: this.transferRules
			},
			null,
			2
		);
	}

	importData(json: string) {
		const data = JSON.parse(json);
		if (Array.isArray(data.accounts)) this.accounts = data.accounts.map(migrateAccount);
		if (Array.isArray(data.projects)) this.projects = data.projects.map(migrateProject);
		if (data.settings) this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
		if (data.incomePlan) this.incomePlan = migrateIncomePlan(data.incomePlan);
		if (Array.isArray(data.lifeEvents)) this.lifeEvents = data.lifeEvents;
		if (Array.isArray(data.snapshots)) this.snapshots = data.snapshots;
		if (Array.isArray(data.transferRules)) this.transferRules = data.transferRules;
		this.recomputeMilestones();
	}

	reset() {
		this.accounts = [];
		this.projects = [];
		this.settings = { ...DEFAULT_SETTINGS };
		this.incomePlan = createDefaultIncomePlan();
		this.lifeEvents = [];
		this.snapshots = [];
		this.transferRules = [];
	}

	/** Jeu de données de démonstration pour explorer l'app rapidement. */
	loadDemo() {
		const year = new Date().getFullYear();
		const now = () => new Date().toISOString();
		const nowMonth = () => now().slice(0, 7) + '-01';
		this.accounts = [
			{
				id: uid(),
				name: 'Compte courant',
				type: 'courant',
				balance: 3200,
				balanceDate: nowMonth(),
				hasYield: false,
				contributions: [],
				compounding: 'annual',
				ratesByYear: {},
				extrapolateRates: true,
				defaultRate: 0,
				color: PALETTE[0],
				createdAt: now()
			},
			{
				id: uid(),
				name: 'Livret A',
				type: 'livret',
				balance: 12000,
				balanceDate: nowMonth(),
				hasYield: true,
				contributions: [{ id: uid(), amount: 200, frequency: 'monthly' }],
				compounding: 'annual',
				// Historique + année en cours : les années futures sont extrapolées (tendance baissière).
				ratesByYear: { [year - 2]: 2, [year - 1]: 3, [year]: 3 },
				extrapolateRates: true,
				defaultRate: 2.5,
				// Plafond réglementaire du Livret A : l'excédent déborde vers l'assurance-vie.
				cap: 22950,
				color: PALETTE[1],
				createdAt: now()
			},
			{
				id: uid(),
				name: "Plan d'épargne entreprise",
				type: 'pee',
				balance: 8500,
				balanceDate: nowMonth(),
				hasYield: true,
				// Versement mensuel + prime d'intéressement annuelle en décembre.
				contributions: [
					{ id: uid(), amount: 150, frequency: 'monthly' },
					{ id: uid(), amount: 1500, frequency: 'annual', month: 12, day: 1 }
				],
				compounding: 'monthly',
				ratesByYear: { [year]: 5 },
				extrapolateRates: true,
				defaultRate: 4.5,
				color: PALETTE[2],
				createdAt: now()
			},
			{
				id: uid(),
				name: 'Assurance-vie',
				type: 'assurance_vie',
				balance: 15000,
				balanceDate: nowMonth(),
				hasYield: true,
				contributions: [{ id: uid(), amount: 100, frequency: 'monthly' }],
				compounding: 'annual',
				ratesByYear: { [year]: 4 },
				extrapolateRates: true,
				defaultRate: 3.5,
				color: PALETTE[3],
				createdAt: now()
			},
			{
				id: uid(),
				name: 'Revolut Épargne',
				type: 'autre',
				balance: 5000,
				balanceDate: nowMonth(),
				hasYield: true,
				contributions: [{ id: uid(), amount: 100, frequency: 'monthly' }],
				// Intérêts versés chaque jour et ajoutés au capital.
				compounding: 'daily',
				ratesByYear: { [year]: 3.25 },
				extrapolateRates: true,
				defaultRate: 3,
				// Compte non défiscalisé : les intérêts sont soumis au PFU (30 %).
				taxable: true,
				taxRatePct: 30,
				color: PALETTE[7],
				createdAt: now()
			}
		];
		const courant = this.accounts[0].id;
		const av = this.accounts[3].id;
		const pee = this.accounts[2].id;
		const livret = this.accounts[1].id;
		const revolut = this.accounts[4].id;

		// L'excédent au-delà du plafond du Livret A part automatiquement sur l'assurance-vie.
		this.accounts[1].overflowAccountId = av;

		// Événements de vie : un changement de voiture l'an prochain (dépense sur le
		// compte courant), et une prime exceptionnelle deux ans après (rentrée sur le PEE).
		this.lifeEvents = [
			{ id: uid(), label: 'Achat voiture d\'occasion', year: year + 1, month: 6, amount: -4000, accountId: courant },
			{ id: uid(), label: 'Prime exceptionnelle', year: year + 2, month: 3, amount: 1000, accountId: pee }
		];

		// Pointages : quelques mois de solde réel déjà enregistrés pour illustrer
		// le suivi prévu vs réel.
		const d0 = new Date();
		const mk = (offset: number, factor: number) => {
			const d = new Date(d0.getFullYear(), d0.getMonth() - offset, 1);
			return {
				id: uid(),
				date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
				balances: {
					[courant]: Math.round(3200 * factor),
					[livret]: Math.round((12000 - (3 - offset) * 200) * factor),
					[pee]: Math.round((8500 - (3 - offset) * 150) * factor),
					[av]: Math.round((15000 - (3 - offset) * 100) * factor),
					[revolut]: Math.round((5000 - (3 - offset) * 100) * factor)
				}
			};
		};
		this.snapshots = [mk(3, 0.985), mk(2, 0.99), mk(1, 1.0), mk(0, 1.008)];

		// Règle de virement : une fois par an, en décembre (juste après le calcul des
		// intérêts), l'excédent du compte courant part sur le PEE, dans la limite de
		// 25 % du salaire brut annuel.
		this.transferRules = [
			{
				id: uid(),
				label: "Versement annuel PEE",
				fromAccountId: courant,
				toAccountId: pee,
				frequency: 'annual',
				month: 12,
				maxPctOfGrossIncome: 25,
				minSourceBalance: 1000,
				enabled: true
			}
		];

		// Plan de revenus : salaire 2 600 €, +2,5 %/an, augmentation ponctuelle de
		// 300 €/mois dans 2 ans ; besoins vitaux détaillés (1 700 €). On épargne 45 %
		// du surplus actuel et 85 % des revenus supplémentaires (la « prime »).
		this.incomePlan = {
			enabled: true,
			netMonthlyIncome: 2600,
			grossMonthlyIncome: 3350,
			annualRaisePct: 2.5,
			raises: [{ id: uid(), year: year + 2, amount: 300 }],
			expenses: [
				{ id: uid(), label: 'Loyer', amount: 950 },
				{ id: uid(), label: 'Courses', amount: 420 },
				{ id: uid(), label: 'Électricité / gaz', amount: 130 },
				{ id: uid(), label: 'Eau', amount: 40 },
				{ id: uid(), label: 'Fibre / mobile', amount: 45 },
				{ id: uid(), label: 'Transports', amount: 115 }
			],
			expenseInflationPct: 2,
			baseSavingsRate: 45,
			raiseSavingsRate: 85,
			allocation: { [pee]: 1, [av]: 1, [revolut]: 2 }
		};

		this.projects = [
			{
				id: uid(),
				name: "Épargne de précaution (6 mois)",
				targetAmount: 12000,
				category: 'urgence',
				color: PALETTE[4],
				fundingAccountIds: [livret],
				createdAt: new Date().toISOString()
			},
			{
				id: uid(),
				name: 'Apport achat maison',
				targetAmount: 60000,
				targetDate: `${year + 5}-06-01`,
				category: 'maison',
				color: PALETTE[5],
				fundingAccountIds: [av, pee, livret],
				createdAt: new Date().toISOString()
			},
			{
				id: uid(),
				name: 'Nouvelle voiture',
				targetAmount: 25000,
				targetDate: `${year + 3}-01-01`,
				category: 'voiture',
				color: PALETTE[6],
				fundingAccountIds: [],
				createdAt: new Date().toISOString()
			},
			{
				id: uid(),
				name: 'Voyage en Islande',
				targetAmount: 2500,
				category: 'voyage',
				color: PALETTE[8],
				fundingAccountIds: [courant],
				completed: true,
				completedDate: new Date(year, new Date().getMonth() - 1, 15).toISOString(),
				withdrawals: { [courant]: 2500 },
				createdAt: new Date(year, new Date().getMonth() - 4, 1).toISOString()
			}
		];

		this.recomputeMilestones();
	}
}

export const store = new AppStore();
