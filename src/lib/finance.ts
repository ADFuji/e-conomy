// Cœur métier : simulation des intérêts composés.
//
// On simule mois par mois, tous les comptes ensemble (pas compte par compte
// isolément), car certains effets sont transversaux : le débordement d'un
// compte plafonné vers un autre, ou la répartition de l'épargne issue du plan
// de revenus. Chaque mois : croissance + versements + événements, puis
// plafonds/cascade.

import type {
	Account,
	AccountType,
	Compounding,
	Contribution,
	IncomePlan,
	LifeEvent,
	Project,
	TransferRule
} from './types';

export interface SimPoint {
	monthIndex: number;
	date: Date;
	/** Solde total (capital + intérêts). */
	balance: number;
	/** Capital versé cumulé (solde initial + versements, net des transferts). */
	principal: number;
	/** Intérêts cumulés générés (nets de fiscalité). */
	interest: number;
}

interface RatePoint {
	year: number;
	rate: number;
}

function knownRatePoints(ratesByYear: Record<number, number>): RatePoint[] {
	return Object.entries(ratesByYear)
		.map(([y, r]) => ({ year: Number(y), rate: Number(r) }))
		.filter((p) => !Number.isNaN(p.year) && !Number.isNaN(p.rate))
		.sort((a, b) => a.year - b.year);
}

/** Régression linéaire (moindres carrés) : la « tangente » de l'évolution des taux. */
export function linearFit(points: RatePoint[]): { slope: number; intercept: number } {
	const n = points.length;
	let sx = 0;
	let sy = 0;
	let sxx = 0;
	let sxy = 0;
	for (const p of points) {
		sx += p.year;
		sy += p.rate;
		sxx += p.year * p.year;
		sxy += p.year * p.rate;
	}
	const denom = n * sxx - sx * sx;
	if (denom === 0) return { slope: 0, intercept: sy / n };
	const slope = (n * sxy - sx * sy) / denom;
	const intercept = (sy - slope * sx) / n;
	return { slope, intercept };
}

/**
 * Estime le taux (%) d'une année : valeur saisie si présente, sinon extrapolation
 * via la tangente de la tendance (ou taux de repli).
 */
export function estimateRate(
	ratesByYear: Record<number, number>,
	defaultRate: number,
	extrapolate: boolean,
	year: number
): number {
	const explicit = ratesByYear[year];
	if (explicit !== undefined && explicit !== null && !Number.isNaN(explicit)) return explicit;

	const known = knownRatePoints(ratesByYear);
	if (!extrapolate || known.length === 0) return defaultRate;
	if (known.length === 1) return known[0].rate;

	const { slope, intercept } = linearFit(known);
	return Math.max(0, slope * year + intercept);
}

/** Taux annuel (%) applicable à un compte pour une année civile donnée (avant scénario). */
export function rateForYear(acc: Account, year: number): number {
	if (!acc.hasYield) return 0;
	return estimateRate(acc.ratesByYear, acc.defaultRate, acc.extrapolateRates, year);
}

function daysInMonth(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Facteur multiplicatif appliqué au solde pour un mois donné, selon la fréquence
 * de capitalisation. Le taux saisi est interprété comme taux annuel nominal.
 */
export function monthlyGrowthFactor(annualPct: number, compounding: Compounding, date: Date): number {
	if (!annualPct) return 1;
	const r = annualPct / 100;
	switch (compounding) {
		case 'monthly':
			return 1 + r / 12;
		case 'daily':
			return Math.pow(1 + r / 365, daysInMonth(date));
		case 'annual':
		default:
			// Rendement annuel exact, réparti mensuellement pour une courbe lisse.
			return Math.pow(1 + r, 1 / 12);
	}
}

/**
 * Applique la fiscalité à un facteur de croissance : seule la part « intérêts »
 * du facteur (au-delà de 1) est amputée du taux d'imposition. Le capital n'est
 * jamais taxé.
 */
export function applyTaxToFactor(factor: number, taxable: boolean, taxRatePct: number): number {
	if (!taxable || factor <= 1) return factor;
	const taxRate = Math.min(1, Math.max(0, taxRatePct / 100));
	return 1 + (factor - 1) * (1 - taxRate);
}

/** Total des versements tombant sur un mois donné (mensuels + annuels du bon mois). */
function contributionForMonth(contributions: Contribution[], date: Date): number {
	const month = date.getMonth() + 1;
	let sum = 0;
	for (const c of contributions ?? []) {
		if (c.frequency === 'monthly') sum += c.amount || 0;
		else if (c.frequency === 'annual' && (c.month ?? 1) === month) sum += c.amount || 0;
	}
	return sum;
}

/** Équivalent mensuel des versements (mensuels + annuels / 12), pour les totaux. */
export function monthlyEquivalent(acc: Account): number {
	let s = 0;
	for (const c of acc.contributions ?? []) {
		s += c.frequency === 'monthly' ? c.amount || 0 : (c.amount || 0) / 12;
	}
	return s;
}

function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Nombre de mois entiers entre deux dates (b − a), en tenant compte du jour du mois. */
export function monthsBetween(a: Date, b: Date): number {
	return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

// ---- Plan de revenus -------------------------------------------------------

/** Salaire net mensuel au mois `monthIndex` (croissance annuelle + augmentations). */
export function monthlyIncomeAt(plan: IncomePlan, monthIndex: number, date: Date): number {
	const years = monthIndex / 12;
	let inc = plan.netMonthlyIncome * Math.pow(1 + plan.annualRaisePct / 100, years);
	for (const r of plan.raises ?? []) {
		if (date.getFullYear() >= r.year) inc += r.amount;
	}
	return inc;
}

/** Somme des besoins vitaux (tous les postes). */
export function totalExpenses(plan: IncomePlan): number {
	return (plan.expenses ?? []).reduce((s, e) => s + (e.amount || 0), 0);
}

/** Besoins vitaux mensuels au mois `monthIndex` (indexés sur l'inflation). */
export function monthlyExpensesAt(plan: IncomePlan, monthIndex: number): number {
	const years = monthIndex / 12;
	return totalExpenses(plan) * Math.pow(1 + plan.expenseInflationPct / 100, years);
}

/**
 * Capacité d'épargne mensuelle au mois `monthIndex` : une part du surplus actuel,
 * plus une part (souvent plus élevée) des revenus supplémentaires gagnés depuis le
 * départ — la logique « mes besoins sont couverts, j'investis l'augmentation ».
 */
export function monthlyInvestableAt(plan: IncomePlan, monthIndex: number, date: Date): number {
	if (!plan.enabled) return 0;
	const inc0 = plan.netMonthlyIncome;
	const exp0 = totalExpenses(plan);
	const inc = monthlyIncomeAt(plan, monthIndex, date);
	const exp = monthlyExpensesAt(plan, monthIndex);

	const base = Math.max(0, inc0 - exp0) * (plan.baseSavingsRate / 100);
	const extraDisposable = Math.max(0, inc - inc0 - (exp - exp0));
	const fromRaises = extraDisposable * (plan.raiseSavingsRate / 100);
	return base + fromRaises;
}

/** Salaire brut mensuel au mois `monthIndex` (même courbe de croissance que le net). */
export function monthlyGrossIncomeAt(plan: IncomePlan, monthIndex: number): number {
	const years = monthIndex / 12;
	return (plan.grossMonthlyIncome || 0) * Math.pow(1 + plan.annualRaisePct / 100, years);
}

/** Fractions d'allocation (normalisées) de l'épargne vers les comptes. */
export function incomeAllocationWeights(
	plan: IncomePlan,
	accounts: Account[]
): Map<string, number> {
	const weights = new Map<string, number>();
	const entries = Object.entries(plan.allocation ?? {}).filter(
		([id, w]) => w > 0 && accounts.some((a) => a.id === id)
	);
	if (entries.length > 0) {
		const total = entries.reduce((s, [, w]) => s + w, 0);
		for (const [id, w] of entries) weights.set(id, w / total);
	} else {
		// Aucune répartition définie : équirépartition sur tous les comptes.
		const n = accounts.length || 1;
		for (const a of accounts) weights.set(a.id, 1 / n);
	}
	return weights;
}

// ---- Événements de vie ------------------------------------------------------

/** Index les événements de vie par compte puis par mois relatif au début de simulation. */
function groupLifeEvents(
	events: LifeEvent[],
	startD: Date,
	horizonMonths: number
): Map<string, Map<number, number>> {
	const map = new Map<string, Map<number, number>>();
	for (const e of events ?? []) {
		const eventDate = new Date(e.year, (e.month || 1) - 1, 1);
		const m = monthsBetween(startD, eventDate);
		if (m < 1 || m > horizonMonths) continue;
		if (!map.has(e.accountId)) map.set(e.accountId, new Map());
		const perMonth = map.get(e.accountId)!;
		perMonth.set(m, (perMonth.get(m) ?? 0) + (e.amount || 0));
	}
	return map;
}

// ---- Simulation --------------------------------------------------------------

export interface SimOptions {
	start?: Date;
	/** Plan de revenus dont la capacité d'épargne alimente les comptes. */
	plan?: IncomePlan;
	/** Ensemble complet des comptes, pour calculer les poids d'allocation du plan. */
	allAccounts?: Account[];
	/** Événements de vie (dépenses/rentrées ponctuelles) à appliquer. */
	lifeEvents?: LifeEvent[];
	/** Écart de taux (points) appliqué à tous les comptes à rendement (scénarios). */
	rateDeltaPct?: number;
	/** Verse un extra mensuel uniforme, réparti à parts égales entre les comptes simulés (solveur). */
	extraMonthly?: number;
	/** Règles de virement automatique entre comptes (fréquence, plafonds). */
	transferRules?: TransferRule[];
}

export interface PortfolioSimulation {
	per: { account: Account; points: SimPoint[] }[];
	total: SimPoint[];
}

/**
 * Simule un ensemble de comptes et agrège le total du portefeuille mois par mois.
 * Gère de façon transversale : la répartition de l'épargne issue du plan de
 * revenus, les événements de vie, la fiscalité des intérêts, et le débordement
 * (cascade) des comptes plafonnés vers un compte de repli.
 *
 * N'effectue PAS le rattrapage des soldes datés dans le passé : les comptes
 * passés en entrée sont simulés tels quels à partir de `opts.start`. C'est le
 * rôle de `simulatePortfolio` (public) d'appeler `catchUpAccounts` avant.
 */
function runSimulation(
	accounts: Account[],
	horizonMonths: number,
	opts: SimOptions = {}
): PortfolioSimulation {
	const start = opts.start ?? new Date();
	const startD = startOfMonth(start);
	const plan = opts.plan;
	const allAccounts = opts.allAccounts ?? accounts;
	const weights = plan && plan.enabled ? incomeAllocationWeights(plan, allAccounts) : null;
	const rateDelta = opts.rateDeltaPct ?? 0;
	const extraPerAccount = accounts.length > 0 ? (opts.extraMonthly ?? 0) / accounts.length : 0;
	const eventsByAccount = groupLifeEvents(opts.lifeEvents ?? [], startD, horizonMonths);

	interface Runtime {
		account: Account;
		balance: number;
		principal: number;
	}
	const runtimes: Runtime[] = accounts.map((a) => ({
		account: a,
		balance: a.balance,
		principal: a.balance
	}));
	const byId = new Map(runtimes.map((r) => [r.account.id, r]));

	const per = runtimes.map((r) => ({
		account: r.account,
		points: [
			{ monthIndex: 0, date: new Date(startD), balance: r.balance, principal: r.principal, interest: 0 }
		] as SimPoint[]
	}));
	const perById = new Map(per.map((p) => [p.account.id, p]));

	const total: SimPoint[] = [
		{
			monthIndex: 0,
			date: new Date(startD),
			balance: runtimes.reduce((s, r) => s + r.balance, 0),
			principal: runtimes.reduce((s, r) => s + r.principal, 0),
			interest: 0
		}
	];

	for (let m = 1; m <= horizonMonths; m++) {
		const d = new Date(startD.getFullYear(), startD.getMonth() + m, 1);

		// 1. Croissance + versements (fixes, plan de revenus, événements de vie).
		for (const r of runtimes) {
			const acc = r.account;
			const baseRate = acc.hasYield ? rateForYear(acc, d.getFullYear()) + rateDelta : 0;
			const rawFactor = acc.hasYield ? monthlyGrowthFactor(Math.max(0, baseRate), acc.compounding, d) : 1;
			const factor = applyTaxToFactor(rawFactor, !!acc.taxable, acc.taxRatePct ?? 30);

			const w = weights?.get(acc.id) ?? 0;
			const incomeContrib = plan && w > 0 ? monthlyInvestableAt(plan, m, d) * w : 0;
			const fixedContrib = contributionForMonth(acc.contributions, d);
			const eventContrib = eventsByAccount.get(acc.id)?.get(m) ?? 0;
			const contrib = fixedContrib + incomeContrib + eventContrib + extraPerAccount;

			r.balance = r.balance * factor + contrib;
			r.principal += contrib;
		}

		// 2. Règles de virement automatique (ex. versement PEE une fois par an,
		// juste après le calcul des intérêts, plafonné en % du salaire brut).
		for (const rule of opts.transferRules ?? []) {
			if (!rule.enabled) continue;
			const month = d.getMonth() + 1;
			const fires = rule.frequency === 'monthly' || (rule.frequency === 'annual' && (rule.month ?? 1) === month);
			if (!fires) continue;
			const source = byId.get(rule.fromAccountId);
			const target = byId.get(rule.toAccountId);
			if (!source || !target) continue;

			const floor = rule.minSourceBalance ?? 0;
			let amount = Math.max(0, source.balance - floor);
			if (rule.maxAmount !== undefined) amount = Math.min(amount, rule.maxAmount);
			if (rule.maxPctOfGrossIncome !== undefined && plan) {
				const grossAnnual = monthlyGrossIncomeAt(plan, m) * 12;
				amount = Math.min(amount, grossAnnual * (rule.maxPctOfGrossIncome / 100));
			}
			if (amount <= 0) continue;

			source.balance -= amount;
			source.principal -= amount;
			target.balance += amount;
			target.principal += amount;
		}

		// 3. Plafonds & cascade : l'excédent est viré vers le compte de débordement.
		// Plusieurs passes pour gérer les chaînes (A déborde vers B, qui déborde vers C).
		for (let pass = 0; pass < 4; pass++) {
			let moved = false;
			for (const r of runtimes) {
				const cap = r.account.cap;
				if (!cap || cap <= 0 || r.balance <= cap) continue;
				const excess = r.balance - cap;
				const target = r.account.overflowAccountId ? byId.get(r.account.overflowAccountId) : undefined;
				if (!target) continue; // pas de compte de repli : le plafond est indicatif seulement.
				r.balance -= excess;
				r.principal -= excess;
				target.balance += excess;
				target.principal += excess;
				moved = true;
			}
			if (!moved) break;
		}

		// 4. Enregistre les points du mois.
		for (const r of runtimes) {
			perById.get(r.account.id)!.points.push({
				monthIndex: m,
				date: d,
				balance: r.balance,
				principal: r.principal,
				interest: r.balance - r.principal
			});
		}
		total.push({
			monthIndex: m,
			date: d,
			balance: runtimes.reduce((s, r) => s + r.balance, 0),
			principal: runtimes.reduce((s, r) => s + r.principal, 0),
			interest: runtimes.reduce((s, r) => s + (r.balance - r.principal), 0)
		});
	}

	return { per, total };
}

/**
 * Fait « avancer » un compte de sa `balanceDate` jusqu'à `asOf`, en appliquant
 * rendement, versements et événements de vie connus sur l'intervalle. Renvoie un
 * compte dont le solde et `balanceDate` sont valables à `asOf`. Sans effet si le
 * compte est déjà à jour (ou daté dans le futur).
 */
export function catchUpAccount(acc: Account, asOf: Date, lifeEvents: LifeEvent[] = []): Account {
	if (!acc.balanceDate) return acc;
	const from = startOfMonth(new Date(acc.balanceDate));
	const to = startOfMonth(asOf);
	const months = monthsBetween(from, to);
	if (months <= 0) return acc;

	const { total } = runSimulation([acc], months, { start: from, lifeEvents });
	const iso = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-01`;
	return { ...acc, balance: total[months].balance, balanceDate: iso };
}

/** Applique `catchUpAccount` à un ensemble de comptes. */
export function catchUpAccounts(accounts: Account[], asOf: Date = new Date(), lifeEvents: LifeEvent[] = []): Account[] {
	return accounts.map((a) => catchUpAccount(a, asOf, lifeEvents));
}

/**
 * Simule un ensemble de comptes à partir d'aujourd'hui (ou de `opts.start`).
 * Rattrape d'abord chaque compte dont le solde est daté dans le passé, pour que
 * la projection démarre toujours d'un solde à jour.
 */
export function simulatePortfolio(
	accounts: Account[],
	horizonMonths: number,
	opts: SimOptions = {}
): PortfolioSimulation {
	const asOf = opts.start ?? new Date();
	const caughtUp = catchUpAccounts(accounts, asOf, opts.lifeEvents ?? []);
	return runSimulation(caughtUp, horizonMonths, { ...opts, start: asOf });
}

/** Les trois variantes optimiste/médiane/pessimiste (écart de taux ±delta). */
export interface ScenarioSet {
	optimistic: PortfolioSimulation;
	median: PortfolioSimulation;
	pessimistic: PortfolioSimulation;
}

export function simulateScenarios(
	accounts: Account[],
	horizonMonths: number,
	opts: SimOptions,
	deltaPct: number
): ScenarioSet {
	return {
		optimistic: simulatePortfolio(accounts, horizonMonths, { ...opts, rateDeltaPct: (opts.rateDeltaPct ?? 0) + deltaPct }),
		median: simulatePortfolio(accounts, horizonMonths, opts),
		pessimistic: simulatePortfolio(accounts, horizonMonths, { ...opts, rateDeltaPct: (opts.rateDeltaPct ?? 0) - deltaPct })
	};
}

export interface ProjectProjection {
	/** Comptes réellement pris en compte pour financer le projet. */
	fundingAccounts: Account[];
	points: SimPoint[];
	/** Total disponible aujourd'hui pour ce projet. */
	current: number;
	/** Progression actuelle (0..1+). */
	progress: number;
	/** Premier point où l'objectif est atteint (ou undefined si hors horizon). */
	reachedPoint?: SimPoint;
	/** L'objectif est-il déjà atteint aujourd'hui ? */
	alreadyReached: boolean;
}

/** Projette un projet à partir de ses comptes de financement. */
export function projectProjection(
	project: Project,
	accounts: Account[],
	horizonMonths: number,
	opts: SimOptions = {}
): ProjectProjection {
	const fundingAccounts =
		project.fundingAccountIds.length > 0
			? accounts.filter((a) => project.fundingAccountIds.includes(a.id))
			: accounts;

	// L'allocation du plan de revenus est calculée sur l'ensemble des comptes ;
	// le projet ne reçoit que la part de ses comptes de financement.
	const { total } = simulatePortfolio(fundingAccounts, horizonMonths, { ...opts, allAccounts: accounts });
	const current = total[0]?.balance ?? 0;
	const reachedPoint = total.find((p) => p.balance >= project.targetAmount);

	return {
		fundingAccounts,
		points: total,
		current,
		progress: project.targetAmount > 0 ? current / project.targetAmount : 0,
		reachedPoint,
		alreadyReached: current >= project.targetAmount
	};
}

/**
 * Ordonne les comptes de financement d'un projet du premier au dernier à
 * débiter lors de sa clôture. Le compte courant (non rémunéré) part toujours
 * en premier. Pour un achat immobilier, l'ordre usuel PEE > Livret > PEA
 * s'applique ensuite ; sinon, on draine en priorité les comptes les moins
 * rémunérateurs pour laisser les meilleurs continuer à fructifier.
 */
export function withdrawalOrder(project: Project, accounts: Account[], year: number): Account[] {
	const isImmo = project.category === 'maison';
	const immoOrder: AccountType[] = ['pee', 'livret', 'pea'];

	function bucket(a: Account): number {
		if (a.type === 'courant') return 0;
		if (isImmo) {
			const idx = immoOrder.indexOf(a.type);
			return idx >= 0 ? 1 + idx : 1 + immoOrder.length;
		}
		return 1;
	}

	return [...accounts].sort((x, y) => {
		const b = bucket(x) - bucket(y);
		if (b !== 0) return b;
		return rateForYear(x, year) - rateForYear(y, year); // à égalité : le moins rémunérateur d'abord
	});
}

/** Répartit un retrait sur des comptes déjà ordonnés, dans la limite du solde de chacun. */
export function distributeWithdrawal(amount: number, orderedAccounts: Account[]): Record<string, number> {
	const out: Record<string, number> = {};
	let remaining = amount;
	for (const a of orderedAccounts) {
		if (remaining <= 0.005) break;
		const take = Math.min(remaining, Math.max(0, a.balance));
		if (take > 0) {
			out[a.id] = take;
			remaining -= take;
		}
	}
	return out;
}

/**
 * Modélise, pour chaque projet actif (non terminé), le retrait de son montant
 * cible à sa date d'échéance (explicite, sinon estimée), réparti sur ses
 * comptes de financement selon `withdrawalOrder`. Le but d'un projet est
 * d'être dépensé : sans ça, la simulation globale surestimerait le patrimoine
 * en laissant fructifier indéfiniment de l'argent déjà destiné à un achat.
 *
 * Les retraits sont appliqués **dans l'ordre chronologique** de leurs
 * échéances : quand plusieurs projets partagent un compte, chacun ne voit que
 * ce qui reste après les retraits des projets déjà clôturés avant lui. Sans
 * ça, deux projets visant la même échéance et le même compte se croiraient
 * chacun seuls à disposer du solde total, et le compte pourrait finir négatif
 * une fois les deux retraits réellement cumulés.
 *
 * Renvoie des événements de vie synthétiques, prêts à être fusionnés dans
 * `opts.lifeEvents` d'une simulation de portefeuille complet.
 */
export function computeProjectWithdrawals(
	projects: Project[],
	accounts: Account[],
	horizonMonths: number,
	opts: SimOptions = {}
): LifeEvent[] {
	// `allAccounts` doit toujours couvrir l'univers complet des comptes, même
	// quand on ne simule que le sous-ensemble finançant un projet donné : sinon
	// les poids d'allocation du plan de revenus se recalculent sur ce
	// sous-ensemble restreint, et un compte peut se voir attribuer 100 % de la
	// capacité d'épargne au lieu de sa part réelle — gonflant artificiellement
	// son solde projeté et faussant tous les retraits calculés à partir de lui.
	const baseOpts: SimOptions = { ...opts, allAccounts: opts.allAccounts ?? accounts };
	const start = baseOpts.start ?? new Date();
	const active = projects.filter((p) => !p.completed);

	// 1. Détermine la date de retrait de chaque projet (référence : simulation
	// sans aucun retrait), pour pouvoir les traiter dans l'ordre chronologique.
	const dated: { project: Project; fundingAccounts: Account[]; targetDate: Date }[] = [];
	for (const project of active) {
		const fundingAccounts = project.fundingAccountIds.length
			? accounts.filter((a) => project.fundingAccountIds.includes(a.id))
			: accounts;
		if (fundingAccounts.length === 0) continue;

		const { total } = simulatePortfolio(fundingAccounts, horizonMonths, baseOpts);
		const targetDate = project.targetDate
			? new Date(project.targetDate)
			: total.find((p) => p.balance >= project.targetAmount)?.date;
		if (targetDate) dated.push({ project, fundingAccounts, targetDate });
	}
	dated.sort((a, b) => a.targetDate.getTime() - b.targetDate.getTime());

	// 2. Rejoue les retraits un par un, dans l'ordre : chaque projet réévalue le
	// solde disponible en tenant compte des retraits déjà décidés avant lui.
	const events: LifeEvent[] = [];
	for (const { project, fundingAccounts, targetDate } of dated) {
		const m = Math.min(horizonMonths, Math.max(0, monthsBetween(start, targetDate)));
		const { per } = simulatePortfolio(fundingAccounts, m, {
			...baseOpts,
			lifeEvents: [...(baseOpts.lifeEvents ?? []), ...events]
		});
		const atDate = fundingAccounts.map((a) => {
			const pts = per.find((p) => p.account.id === a.id)?.points;
			const balance = pts ? pts[pts.length - 1].balance : a.balance;
			return { ...a, balance };
		});

		const amount = Math.min(project.targetAmount, atDate.reduce((s, a) => s + Math.max(0, a.balance), 0));
		if (amount <= 0) continue;

		const ordered = withdrawalOrder(project, atDate, targetDate.getFullYear());
		const withdrawals = distributeWithdrawal(amount, ordered);
		for (const [accountId, amt] of Object.entries(withdrawals)) {
			events.push({
				id: `proj-${project.id}-${accountId}`,
				label: `Projet : ${project.name}`,
				year: targetDate.getFullYear(),
				month: targetDate.getMonth() + 1,
				amount: -amt,
				accountId
			});
		}
	}
	return events;
}

/**
 * Répartit la valeur totale d'un portefeuille entre projets par ordre de
 * priorité (l'ordre du tableau) : le projet 1 est financé en premier jusqu'à
 * son objectif, le reste va au projet 2, etc. Mode simplifié qui considère
 * l'épargne comme un pot commun plutôt que par compte de financement.
 */
export interface PriorityAllocation {
	projectId: string;
	/** Part de l'épargne actuelle allouée à ce projet. */
	current: number;
	/** Premier point où le cumul (projets précédents + ce projet) atteint la cible. */
	reachedPoint?: SimPoint;
	alreadyReached: boolean;
	progress: number;
}

export function waterfallProjectAllocations(
	projectsInOrder: Project[],
	poolTotal: SimPoint[]
): PriorityAllocation[] {
	const out: PriorityAllocation[] = [];
	let cumulativeTarget = 0;
	const currentPool = poolTotal[0]?.balance ?? 0;
	let remainingPool = currentPool;

	for (const project of projectsInOrder) {
		const previousCumulative = cumulativeTarget;
		cumulativeTarget += project.targetAmount;
		const current = Math.max(0, Math.min(project.targetAmount, remainingPool));
		remainingPool = Math.max(0, remainingPool - current);

		const reachedPoint = poolTotal.find((p) => p.balance >= cumulativeTarget);
		out.push({
			projectId: project.id,
			current,
			reachedPoint,
			alreadyReached: currentPool >= cumulativeTarget,
			progress: project.targetAmount > 0 ? current / project.targetAmount : 0
		});
		void previousCumulative;
	}
	return out;
}

/** Rend une valeur de compte à un horizon donné (en années). */
export function valueAtYears(points: SimPoint[], years: number): SimPoint | undefined {
	return points[Math.min(years * 12, points.length - 1)];
}

/** Renvoie les indices de points correspondant à des jalons annuels (0, 12, 24, …). */
export function yearlyMilestones(points: SimPoint[]): SimPoint[] {
	const out: SimPoint[] = [];
	for (let i = 0; i < points.length; i += 12) out.push(points[i]);
	return out;
}

/** Déflate une série de points d'une inflation annuelle donnée, pour un affichage en euros constants. */
export function deflateSeries(points: SimPoint[], inflationPct: number): SimPoint[] {
	if (!inflationPct) return points;
	return points.map((p) => {
		const factor = Math.pow(1 + inflationPct / 100, p.monthIndex / 12);
		return {
			...p,
			balance: p.balance / factor,
			principal: p.principal / factor,
			interest: p.interest / factor
		};
	});
}

// ---- Indépendance financière (rente) ----------------------------------------

/** Capital nécessaire pour tirer une rente mensuelle donnée, au taux de retrait choisi. */
export function capitalNeededForRente(monthlyAmount: number, withdrawalRatePct: number): number {
	if (withdrawalRatePct <= 0) return Infinity;
	return (monthlyAmount * 12) / (withdrawalRatePct / 100);
}

/** Rente mensuelle que peut soutenir un capital donné, au taux de retrait choisi. */
export function renteFromCapital(capital: number, withdrawalRatePct: number): number {
	return (capital * (withdrawalRatePct / 100)) / 12;
}

/**
 * Classification indicative des types de compte pour l'allocation « croissance
 * vs sécurisé ». Approximatif par nature (un PEE peut être investi en fonds
 * euro, une assurance-vie en unités de compte…) : sert de repère, pas de conseil
 * personnalisé.
 */
export const GROWTH_ACCOUNT_TYPES: AccountType[] = ['pea', 'cto', 'pee', 'per'];
export const SAFE_ACCOUNT_TYPES: AccountType[] = ['courant', 'livret', 'especes', 'assurance_vie', 'autre'];

export function isGrowthAccount(type: AccountType): boolean {
	return GROWTH_ACCOUNT_TYPES.includes(type);
}

/** Répartition actuelle du patrimoine entre comptes « croissance » et « sécurisés ». */
export function currentAllocationSplit(accounts: Account[]): { growth: number; safe: number } {
	let growth = 0;
	let safe = 0;
	for (const a of accounts) {
		if (isGrowthAccount(a.type)) growth += a.balance;
		else safe += a.balance;
	}
	return { growth, safe };
}

/**
 * Répartition cible indicative selon l'horizon avant l'indépendance financière :
 * glide path classique, plus l'échéance approche, plus on sécurise le capital.
 * Simple règle de bon sens, pas un conseil personnalisé.
 */
export function recommendedAllocation(yearsToGoal: number): { growthPct: number; safePct: number } {
	let growthPct: number;
	if (yearsToGoal >= 15) growthPct = 70;
	else if (yearsToGoal >= 5) growthPct = 50;
	else growthPct = 30;
	return { growthPct, safePct: 100 - growthPct };
}

/**
 * Résout par bissection le versement mensuel supplémentaire (réparti à parts
 * égales entre les comptes de financement) nécessaire pour atteindre `targetAmount`
 * à la date `targetDate`. Renvoie 0 si l'objectif est déjà en bonne voie, et
 * `undefined` si la date cible est déjà passée.
 */
export function requiredMonthlyContribution(
	fundingAccounts: Account[],
	targetAmount: number,
	targetDate: Date,
	opts: SimOptions = {}
): number | undefined {
	const start = opts.start ?? new Date();
	const months = monthsBetween(startOfMonth(start), startOfMonth(targetDate));
	if (months <= 0 || fundingAccounts.length === 0) return undefined;

	const evaluate = (extra: number) =>
		simulatePortfolio(fundingAccounts, months, { ...opts, extraMonthly: extra }).total[months]
			.balance;

	if (evaluate(0) >= targetAmount) return 0;

	let hi = Math.max(100, targetAmount / months);
	for (let i = 0; i < 60 && evaluate(hi) < targetAmount; i++) hi *= 2;

	let lo = 0;
	for (let i = 0; i < 40; i++) {
		const mid = (lo + hi) / 2;
		if (evaluate(mid) < targetAmount) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}
