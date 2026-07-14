import { describe, expect, it } from 'vitest';
import type { Account, IncomePlan, Project, TransferRule } from './types';
import {
	applyTaxToFactor,
	capitalNeededForRente,
	catchUpAccount,
	catchUpAccounts,
	computeProjectWithdrawals,
	currentAllocationSplit,
	deflateSeries,
	distributeWithdrawal,
	estimateRate,
	linearFit,
	monthlyBudgetAt,
	monthlyGrowthFactor,
	monthsBetween,
	recommendedAllocation,
	renteFromCapital,
	requiredMonthlyContribution,
	simulatePortfolio,
	waterfallProjectAllocations,
	withdrawalOrder
} from './finance';

function mkAccount(overrides: Partial<Account> = {}): Account {
	return {
		id: overrides.id ?? 'acc',
		name: 'Test',
		type: 'livret',
		balance: 1000,
		balanceDate: '2026-01-01',
		hasYield: true,
		contributions: [],
		compounding: 'annual',
		ratesByYear: {},
		extrapolateRates: true,
		defaultRate: 0,
		color: '#000',
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

function mkProject(overrides: Partial<Project> = {}): Project {
	return {
		id: overrides.id ?? 'proj',
		name: 'Test',
		targetAmount: 1000,
		category: 'autre',
		color: '#000',
		fundingAccountIds: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

function mkPlan(overrides: Partial<IncomePlan> = {}): IncomePlan {
	return {
		enabled: true,
		netMonthlyIncome: 3000,
		grossMonthlyIncome: 3800,
		annualRaisePct: 0,
		raises: [],
		expenses: [],
		expenseInflationPct: 0,
		baseSavingsRate: 100,
		raiseSavingsRate: 100,
		allocation: {},
		capSavingsToSurplus: false,
		...overrides
	};
}

describe('linearFit / estimateRate', () => {
	it('passes exactly through two points (fully determined line)', () => {
		const { slope, intercept } = linearFit([
			{ year: 2024, rate: 2 },
			{ year: 2026, rate: 4 }
		]);
		expect(slope).toBeCloseTo(1, 8);
		expect(2024 * slope + intercept).toBeCloseTo(2, 6);
		expect(2026 * slope + intercept).toBeCloseTo(4, 6);
	});

	it('computes the least-squares slope for three non-collinear points', () => {
		const { slope, intercept } = linearFit([
			{ year: 2024, rate: 2 },
			{ year: 2025, rate: 3 },
			{ year: 2026, rate: 3 }
		]);
		// Moindres carrés (pas d'interpolation exacte) : pente 0.5, mais la droite
		// ne passe pas pile par (2024, 2) puisque les 3 points ne sont pas alignés.
		expect(slope).toBeCloseTo(0.5, 5);
		expect(2024 * slope + intercept).toBeCloseTo(2.1667, 3);
	});

	it('extrapolates missing years via the fitted trend', () => {
		const rates = { 2024: 2, 2025: 3, 2026: 3 };
		expect(estimateRate(rates, 0, true, 2027)).toBeCloseTo(3.6666, 3);
		expect(estimateRate(rates, 0, true, 2023)).toBeCloseTo(1.6666, 3);
	});

	it('returns the explicit rate when present, ignoring extrapolation', () => {
		expect(estimateRate({ 2026: 5 }, 1, true, 2026)).toBe(5);
	});

	it('falls back to defaultRate without extrapolation or with < 2 points', () => {
		expect(estimateRate({}, 1.5, true, 2026)).toBe(1.5);
		expect(estimateRate({ 2026: 4 }, 1.5, true, 2027)).toBe(4); // un seul point connu
		expect(estimateRate({ 2024: 2, 2025: 3 }, 1.5, false, 2026)).toBe(1.5);
	});
});

describe('monthlyGrowthFactor', () => {
	it('annual compounding raised to 12 gives exactly 1+r', () => {
		const d = new Date(2026, 0, 1);
		const factor = monthlyGrowthFactor(6, 'annual', d);
		expect(Math.pow(factor, 12)).toBeCloseTo(1.06, 10);
	});

	it('monthly compounding is 1 + r/12', () => {
		const d = new Date(2026, 0, 1);
		expect(monthlyGrowthFactor(12, 'monthly', d)).toBeCloseTo(1.01, 10);
	});

	it('daily compounding yields more than monthly for the same nominal rate over a full year', () => {
		const start = new Date(2026, 0, 1);
		let monthlyProduct = 1;
		let dailyProduct = 1;
		for (let m = 0; m < 12; m++) {
			const d = new Date(2026, m, 1);
			monthlyProduct *= monthlyGrowthFactor(6, 'monthly', d);
			dailyProduct *= monthlyGrowthFactor(6, 'daily', d);
		}
		expect(dailyProduct).toBeGreaterThan(monthlyProduct);
		void start;
	});

	it('a zero rate never grows the balance', () => {
		expect(monthlyGrowthFactor(0, 'daily', new Date(2026, 0, 1))).toBe(1);
	});
});

describe('applyTaxToFactor', () => {
	it('taxes only the interest portion, never the capital', () => {
		// Facteur 1.01 = 1% d'intérêt ; taxé à 30%, il ne reste que 0.7% net.
		expect(applyTaxToFactor(1.01, true, 30)).toBeCloseTo(1.007, 10);
	});

	it('leaves the factor untouched when not taxable or when there is no growth', () => {
		expect(applyTaxToFactor(1.01, false, 30)).toBe(1.01);
		expect(applyTaxToFactor(1, true, 30)).toBe(1);
		expect(applyTaxToFactor(0.98, true, 30)).toBe(0.98);
	});
});

describe('simulatePortfolio — invariants de base', () => {
	it('interest is always balance minus principal, and a non-yield account never grows', () => {
		const acc = mkAccount({
			hasYield: false,
			balance: 500,
			contributions: [{ id: 'c1', amount: 50, frequency: 'monthly' }]
		});
		const { total } = simulatePortfolio([acc], 24, { start: new Date(2026, 0, 1) });
		for (const p of total) {
			expect(p.balance - p.principal).toBeCloseTo(p.interest, 8);
		}
		expect(total[24].balance).toBeCloseTo(500 + 24 * 50, 6);
		expect(total[24].interest).toBeCloseTo(0, 6);
	});

	it('conserves total value across a portfolio regardless of internal transfers', () => {
		const source = mkAccount({ id: 'a', balance: 100, cap: 100, overflowAccountId: 'b' });
		const target = mkAccount({ id: 'b', balance: 0, hasYield: false });
		const { total } = simulatePortfolio([source, target], 6, {
			start: new Date(2026, 0, 1)
		});
		// Aucun rendement (defaultRate 0 par défaut), aucun versement : le total ne bouge pas.
		for (const p of total) expect(p.balance).toBeCloseTo(100, 8);
	});
});

describe('simulatePortfolio — plafond & cascade', () => {
	it('caps a source account and moves the excess to the overflow account', () => {
		const source = mkAccount({
			id: 'src',
			balance: 0,
			cap: 100,
			overflowAccountId: 'dst',
			hasYield: false,
			contributions: [{ id: 'c1', amount: 50, frequency: 'monthly' }]
		});
		const target = mkAccount({ id: 'dst', balance: 0, hasYield: false });
		const { per, total } = simulatePortfolio([source, target], 4, {
			start: new Date(2026, 0, 1)
		});

		// Après 4 mois de +50, la source aurait 200 sans plafond ; elle est cappée à 100.
		const srcPoints = per.find((p) => p.account.id === 'src')!.points;
		const dstPoints = per.find((p) => p.account.id === 'dst')!.points;
		expect(srcPoints[4].balance).toBeCloseTo(100, 6);
		expect(dstPoints[4].balance).toBeCloseTo(100, 6); // 200 versés - 100 plafond
		expect(total[4].balance).toBeCloseTo(200, 6); // rien n'a disparu
	});

	it('chains overflow across three accounts (A -> B -> C)', () => {
		const a = mkAccount({ id: 'a', balance: 0, cap: 10, overflowAccountId: 'b', hasYield: false });
		const b = mkAccount({ id: 'b', balance: 0, cap: 10, overflowAccountId: 'c', hasYield: false });
		const c = mkAccount({ id: 'c', balance: 0, hasYield: false });
		// Versement de 35 sur A dès le premier mois simulé.
		a.contributions = [{ id: 'c1', amount: 35, frequency: 'monthly' }];
		const { per } = simulatePortfolio([a, b, c], 1, { start: new Date(2026, 0, 1) });
		const byId = Object.fromEntries(per.map((p) => [p.account.id, p.points[1].balance]));
		expect(byId.a).toBeCloseTo(10, 6);
		expect(byId.b).toBeCloseTo(10, 6);
		expect(byId.c).toBeCloseTo(15, 6);
	});
});

describe('catchUpAccount / catchUpAccounts', () => {
	it('is a no-op when balanceDate is the current month', () => {
		const acc = mkAccount({ balanceDate: '2026-03-01' });
		const asOf = new Date(2026, 2, 15);
		const result = catchUpAccount(acc, asOf);
		expect(result.balance).toBe(acc.balance);
		expect(result.balanceDate).toBe('2026-03-01');
	});

	it('advances a stale balance using its own contributions', () => {
		const acc = mkAccount({
			balance: 1000,
			balanceDate: '2026-01-01',
			hasYield: false,
			contributions: [{ id: 'c1', amount: 100, frequency: 'monthly' }]
		});
		const caught = catchUpAccount(acc, new Date(2026, 3, 1)); // 3 mois plus tard
		expect(caught.balance).toBeCloseTo(1300, 6);
		expect(caught.balanceDate).toBe('2026-04-01');
	});

	it('applies known life events during the catch-up window', () => {
		const acc = mkAccount({ balance: 1000, balanceDate: '2026-01-01', hasYield: false });
		const events = [{ id: 'e1', label: 'Prime', year: 2026, month: 2, amount: 500, accountId: acc.id }];
		const caught = catchUpAccount(acc, new Date(2026, 2, 1), events);
		expect(caught.balance).toBeCloseTo(1500, 6);
	});

	it('catchUpAccounts maps over a whole portfolio', () => {
		const accs = [mkAccount({ id: 'a', balanceDate: '2026-01-01' }), mkAccount({ id: 'b', balanceDate: '2026-02-01' })];
		const result = catchUpAccounts(accs, new Date(2026, 2, 1));
		expect(result.map((a) => a.balanceDate)).toEqual(['2026-03-01', '2026-03-01']);
	});
});

describe('requiredMonthlyContribution', () => {
	it('solves the exact contribution for a no-yield account', () => {
		const acc = mkAccount({ balance: 0, hasYield: false });
		const start = new Date(2026, 0, 1);
		const target = new Date(2027, 0, 1); // 12 mois plus tard
		const result = requiredMonthlyContribution([acc], 1200, target, { start });
		expect(result).toBeCloseTo(100, 1);
	});

	it('returns 0 when the target is already on track', () => {
		const acc = mkAccount({ balance: 100000, hasYield: false });
		const result = requiredMonthlyContribution([acc], 1000, new Date(2027, 0, 1), {
			start: new Date(2026, 0, 1)
		});
		expect(result).toBe(0);
	});

	it('returns undefined when the target date has already passed', () => {
		const acc = mkAccount({ balance: 0 });
		const result = requiredMonthlyContribution([acc], 1000, new Date(2025, 0, 1), {
			start: new Date(2026, 0, 1)
		});
		expect(result).toBeUndefined();
	});
});

describe('waterfallProjectAllocations', () => {
	it('fills higher-priority projects first from a shared pool', () => {
		const pool = [{ monthIndex: 0, date: new Date(), balance: 100, principal: 100, interest: 0 }];
		const projects: Project[] = [
			{ id: 'p1', name: 'A', targetAmount: 60, category: 'autre', color: '#fff', fundingAccountIds: [], createdAt: '' },
			{ id: 'p2', name: 'B', targetAmount: 60, category: 'autre', color: '#fff', fundingAccountIds: [], createdAt: '' }
		];
		const [a1, a2] = waterfallProjectAllocations(projects, pool);
		expect(a1.current).toBe(60);
		expect(a1.alreadyReached).toBe(true);
		expect(a2.current).toBe(40);
		expect(a2.alreadyReached).toBe(false);
	});
});

describe('deflateSeries', () => {
	it('discounts future value by compounded inflation', () => {
		const points = [
			{ monthIndex: 0, date: new Date(), balance: 100, principal: 100, interest: 0 },
			{ monthIndex: 12, date: new Date(), balance: 102, principal: 100, interest: 2 }
		];
		const deflated = deflateSeries(points, 2);
		expect(deflated[0].balance).toBeCloseTo(100, 6);
		expect(deflated[1].balance).toBeCloseTo(100, 6); // 102 / 1.02
	});

	it('is a no-op with zero inflation', () => {
		const points = [{ monthIndex: 0, date: new Date(), balance: 100, principal: 100, interest: 0 }];
		expect(deflateSeries(points, 0)).toBe(points);
	});
});

describe('monthsBetween', () => {
	it('counts whole calendar months regardless of day-of-month', () => {
		expect(monthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 1))).toBe(1);
		expect(monthsBetween(new Date(2026, 0, 1), new Date(2027, 5, 1))).toBe(17);
		expect(monthsBetween(new Date(2026, 5, 1), new Date(2026, 0, 1))).toBe(-5);
	});
});

// Garde-fou pour ne pas casser accidentellement la signature utilisée par le
// plan de revenus (testé indirectement via simulatePortfolio ci-dessus).
describe('plan de revenus minimal', () => {
	it('an empty/disabled plan contributes nothing', () => {
		const plan: IncomePlan = {
			enabled: false,
			netMonthlyIncome: 3000,
			grossMonthlyIncome: 3800,
			annualRaisePct: 0,
			raises: [],
			expenses: [],
			expenseInflationPct: 0,
			baseSavingsRate: 100,
			raiseSavingsRate: 100,
			allocation: {},
			capSavingsToSurplus: false
		};
		const acc = mkAccount({ hasYield: false, balance: 0 });
		const { total } = simulatePortfolio([acc], 6, { start: new Date(2026, 0, 1), plan });
		expect(total[6].balance).toBe(0);
	});
});

describe('withdrawalOrder', () => {
	it('always drains the compte courant first', () => {
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false });
		const livret = mkAccount({ id: 'l', type: 'livret', defaultRate: 3, ratesByYear: {} });
		const order = withdrawalOrder(mkProject({ category: 'voyage' }), [livret, courant], 2026);
		expect(order[0].id).toBe('c');
	});

	it('drains the lowest-yield account first by default (courant excepted)', () => {
		const highYield = mkAccount({ id: 'hi', type: 'pea', defaultRate: 8 });
		const lowYield = mkAccount({ id: 'lo', type: 'livret', defaultRate: 2 });
		const order = withdrawalOrder(mkProject({ category: 'voyage' }), [highYield, lowYield], 2026);
		expect(order.map((a) => a.id)).toEqual(['lo', 'hi']);
	});

	it('uses PEE > Livret > PEA for a real-estate project, after courant', () => {
		const pea = mkAccount({ id: 'pea', type: 'pea' });
		const pee = mkAccount({ id: 'pee', type: 'pee' });
		const livret = mkAccount({ id: 'livret', type: 'livret' });
		const courant = mkAccount({ id: 'courant', type: 'courant', hasYield: false });
		const order = withdrawalOrder(mkProject({ category: 'maison' }), [pea, courant, livret, pee], 2026);
		expect(order.map((a) => a.id)).toEqual(['courant', 'pee', 'livret', 'pea']);
	});
});

describe('distributeWithdrawal', () => {
	it('takes from accounts in order, capped at each balance, until the amount is covered', () => {
		const a = mkAccount({ id: 'a', balance: 100 });
		const b = mkAccount({ id: 'b', balance: 500 });
		const result = distributeWithdrawal(300, [a, b]);
		expect(result).toEqual({ a: 100, b: 200 });
	});

	it('takes at most what is available, even if the pool falls short', () => {
		const a = mkAccount({ id: 'a', balance: 50 });
		const result = distributeWithdrawal(300, [a]);
		expect(result).toEqual({ a: 50 });
	});
});

describe('computeProjectWithdrawals', () => {
	it('produces a negative life event at the target date, skipping completed projects', () => {
		const acc = mkAccount({ id: 'a', balance: 5000, hasYield: false });
		const active = mkProject({ id: 'p1', targetAmount: 1000, targetDate: '2026-06-01', fundingAccountIds: ['a'] });
		const done = mkProject({ id: 'p2', targetAmount: 1000, completed: true, fundingAccountIds: ['a'] });

		const events = computeProjectWithdrawals([active, done], [acc], 12, { start: new Date(2026, 0, 1) });

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ accountId: 'a', amount: -1000, year: 2026, month: 6 });
	});

	it('spreads the withdrawal across accounts per withdrawalOrder when one is insufficient', () => {
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false, balance: 300 });
		const livret = mkAccount({ id: 'l', type: 'livret', hasYield: false, balance: 5000 });
		const project = mkProject({ targetAmount: 1000, targetDate: '2026-03-01', fundingAccountIds: ['c', 'l'] });

		const events = computeProjectWithdrawals([project], [courant, livret], 12, { start: new Date(2026, 0, 1) });
		const byAccount = Object.fromEntries(events.map((e) => [e.accountId, -e.amount]));
		expect(byAccount.c).toBeCloseTo(300, 6);
		expect(byAccount.l).toBeCloseTo(700, 6);
	});

	it('processes withdrawals chronologically so a later project never sees money already spent (regression)', () => {
		// Deux projets visent le même compte, à la même échéance, pour un total
		// (1500) supérieur au solde disponible (1000). Avant la correction, les
		// deux étaient calculés indépendamment sur le même solde de départ et
		// pouvaient ensemble faire passer le compte négatif une fois cumulés.
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false, balance: 1000 });
		const p1 = mkProject({ id: 'p1', name: 'A', targetAmount: 800, targetDate: '2026-03-01', fundingAccountIds: ['c'] });
		const p2 = mkProject({ id: 'p2', name: 'B', targetAmount: 700, targetDate: '2026-03-01', fundingAccountIds: ['c'] });

		const events = computeProjectWithdrawals([p1, p2], [courant], 12, { start: new Date(2026, 0, 1) });
		const totalWithdrawn = events.reduce((s, e) => s - e.amount, 0);

		expect(totalWithdrawn).toBeLessThanOrEqual(1000 + 1e-6);

		// Le compte, une fois les deux retraits appliqués, ne doit jamais finir négatif.
		const { total } = simulatePortfolio([courant], 12, {
			start: new Date(2026, 0, 1),
			lifeEvents: events
		});
		for (const p of total) expect(p.balance).toBeGreaterThanOrEqual(-1e-6);
	});

	it('an accepted-but-later project sees the reduced balance left by an earlier one on the same account', () => {
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false, balance: 1000 });
		const early = mkProject({ id: 'p1', name: 'Early', targetAmount: 600, targetDate: '2026-02-01', fundingAccountIds: ['c'] });
		const later = mkProject({ id: 'p2', name: 'Later', targetAmount: 600, targetDate: '2026-06-01', fundingAccountIds: ['c'] });

		const events = computeProjectWithdrawals([early, later], [courant], 12, { start: new Date(2026, 0, 1) });
		const byProject = Object.fromEntries(events.map((e) => [e.id.split('-')[1], -e.amount]));

		expect(byProject.p1).toBeCloseTo(600, 6); // le premier prend son plein montant
		expect(byProject.p2).toBeCloseTo(400, 6); // le second ne trouve que le reste (1000 - 600)
	});

	it('uses the full account universe for income-allocation weights, not just the funding subset (regression)', () => {
		// "a" ne reçoit que 1/3 de l'épargne mensuelle (poids 1 sur 3), "b" les 2/3
		// restants (poids 2). Si la simulation interne d'un projet ne financant que
		// "a" oublie de préciser l'univers complet des comptes, "b" disparaît du
		// calcul des poids et "a" se retrouve à tort crédité de 100 % de l'épargne.
		const a = mkAccount({ id: 'a', hasYield: false, balance: 0 });
		const b = mkAccount({ id: 'b', hasYield: false, balance: 0 });
		const plan: IncomePlan = {
			enabled: true,
			netMonthlyIncome: 3000,
			grossMonthlyIncome: 3000,
			annualRaisePct: 0,
			raises: [],
			expenses: [],
			expenseInflationPct: 0,
			baseSavingsRate: 100,
			raiseSavingsRate: 100,
			allocation: { a: 1, b: 2 },
			capSavingsToSurplus: false
		};
		const project = mkProject({ targetAmount: 2500, targetDate: '2026-03-01', fundingAccountIds: ['a'] });

		// Ne passe pas `allAccounts` explicitement : exactement le scénario qui a
		// révélé le bug (l'appelant se repose sur `computeProjectWithdrawals` pour
		// reconstituer l'univers complet à partir de son paramètre `accounts`).
		const events = computeProjectWithdrawals([project], [a, b], 12, { start: new Date(2026, 0, 1), plan });
		const withdrawn = events.filter((e) => e.accountId === 'a').reduce((s, e) => s - e.amount, 0);

		// Avec la pondération correcte (1/3 de 3000€ sur 2 mois = 2000€), le retrait
		// est plafonné à 2000, pas au montant cible de 2500 (qui supposerait à tort
		// que "a" a reçu 100 % de l'épargne).
		expect(withdrawn).toBeCloseTo(2000, 1);
	});
});

describe('simulatePortfolio — règles de virement', () => {
	it('fires an annual rule only in its configured month, capped at % of gross income', () => {
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false, balance: 10000 });
		const pee = mkAccount({ id: 'p', type: 'pee', hasYield: false, balance: 0 });
		const plan: IncomePlan = {
			enabled: true,
			netMonthlyIncome: 2000,
			grossMonthlyIncome: 2500, // 30 000 €/an brut
			annualRaisePct: 0,
			raises: [],
			expenses: [],
			expenseInflationPct: 0,
			baseSavingsRate: 0,
			raiseSavingsRate: 0,
			allocation: {},
			capSavingsToSurplus: false
		};
		const rule: TransferRule = {
			id: 'r1',
			label: 'PEE',
			fromAccountId: 'c',
			toAccountId: 'p',
			frequency: 'annual',
			month: 6,
			maxPctOfGrossIncome: 25, // 25% de 30 000 = 7 500
			enabled: true
		};
		const { per } = simulatePortfolio([courant, pee], 12, {
			start: new Date(2026, 0, 1),
			plan,
			transferRules: [rule]
		});
		const peePoints = per.find((p) => p.account.id === 'p')!.points;
		// Le mois 5 (index dans la boucle) tombe en juin 2026 (départ = janvier,
		// mois 0) : rien avant, 7 500 exactement à partir de ce mois-là.
		expect(peePoints[4].balance).toBe(0);
		expect(peePoints[5].balance).toBeCloseTo(7500, 6);
		expect(peePoints[12].balance).toBeCloseTo(7500, 6); // ne se redéclenche pas avant l'année suivante (hors horizon)
	});

	it('never pulls the source below minSourceBalance', () => {
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false, balance: 1200 });
		const livret = mkAccount({ id: 'l', type: 'livret', hasYield: false, balance: 0 });
		const rule: TransferRule = {
			id: 'r1',
			label: 'x',
			fromAccountId: 'c',
			toAccountId: 'l',
			frequency: 'monthly',
			minSourceBalance: 1000,
			enabled: true
		};
		const { per } = simulatePortfolio([courant, livret], 1, {
			start: new Date(2026, 0, 1),
			transferRules: [rule]
		});
		const c = per.find((p) => p.account.id === 'c')!.points[1].balance;
		expect(c).toBeCloseTo(1000, 6);
	});

	it('a disabled rule never fires', () => {
		const courant = mkAccount({ id: 'c', type: 'courant', hasYield: false, balance: 1000 });
		const livret = mkAccount({ id: 'l', type: 'livret', hasYield: false, balance: 0 });
		const rule: TransferRule = {
			id: 'r1',
			label: 'x',
			fromAccountId: 'c',
			toAccountId: 'l',
			frequency: 'monthly',
			enabled: false
		};
		const { per } = simulatePortfolio([courant, livret], 1, {
			start: new Date(2026, 0, 1),
			transferRules: [rule]
		});
		expect(per.find((p) => p.account.id === 'l')!.points[1].balance).toBe(0);
	});
});

describe('rente / indépendance financière', () => {
	it('capitalNeededForRente and renteFromCapital are inverses at a given rate', () => {
		const capital = capitalNeededForRente(2000, 4); // 2000€/mois, retrait 4%/an
		expect(capital).toBeCloseTo(600000, 6); // 2000*12 / 0.04
		expect(renteFromCapital(capital, 4)).toBeCloseTo(2000, 6);
	});

	it('a higher withdrawal rate requires less capital for the same rente', () => {
		expect(capitalNeededForRente(2000, 5)).toBeLessThan(capitalNeededForRente(2000, 3));
	});

	it('currentAllocationSplit buckets accounts into growth vs safe', () => {
		const pea = mkAccount({ id: 'pea', type: 'pea', balance: 300 });
		const livret = mkAccount({ id: 'l', type: 'livret', balance: 700 });
		const split = currentAllocationSplit([pea, livret]);
		expect(split).toEqual({ growth: 300, safe: 700 });
	});

	it('recommendedAllocation favors growth far from the goal and safety close to it', () => {
		expect(recommendedAllocation(20).growthPct).toBe(70);
		expect(recommendedAllocation(10).growthPct).toBe(50);
		expect(recommendedAllocation(2).growthPct).toBe(30);
	});
});

describe('mémoïsation de simulatePortfolio', () => {
	it('renvoie la même référence pour des entrées identiques (cache hit)', () => {
		const acc = mkAccount({ id: 'm1', balance: 500, hasYield: false });
		const opts = { start: new Date(2026, 0, 1) };
		const a = simulatePortfolio([acc], 6, opts);
		const b = simulatePortfolio([acc], 6, opts);
		expect(a).toBe(b);
	});

	it('recalcule quand une entrée change, sans altérer les valeurs', () => {
		const acc1 = mkAccount({ id: 'm2', balance: 500, hasYield: false });
		const acc2 = mkAccount({ id: 'm2', balance: 900, hasYield: false });
		const opts = { start: new Date(2026, 0, 1) };
		const a = simulatePortfolio([acc1], 6, opts);
		const b = simulatePortfolio([acc2], 6, opts);
		expect(a).not.toBe(b);
		expect(a.total[6].balance).toBeCloseTo(500, 6);
		expect(b.total[6].balance).toBeCloseTo(900, 6);
	});
});

describe('monthlyBudgetAt', () => {
	it('décompose revenu, besoins, versements fixes et reste à vivre', () => {
		const plan = mkPlan({
			netMonthlyIncome: 3000,
			expenses: [{ id: 'e', label: 'Loyer', amount: 1200 }],
			baseSavingsRate: 0,
			raiseSavingsRate: 0
		});
		const acc = mkAccount({
			id: 'a',
			contributions: [
				{ id: 'c1', amount: 200, frequency: 'monthly' },
				{ id: 'c2', amount: 1200, frequency: 'annual', month: 12 }
			]
		});
		const b = monthlyBudgetAt(plan, [acc], 0, new Date(2026, 0, 1));
		expect(b.income).toBeCloseTo(3000, 6);
		expect(b.expenses).toBeCloseTo(1200, 6);
		// versements fixes lissés : 200/mois + 1200/an = 300/mois
		expect(b.fixedContributions).toBeCloseTo(300, 6);
		expect(b.planSavings).toBeCloseTo(0, 6);
		expect(b.remaining).toBeCloseTo(1500, 6); // 3000 - 1200 - 300
	});

	it('signale un reste à vivre négatif quand l’épargne dépasse le surplus', () => {
		const plan = mkPlan({
			netMonthlyIncome: 2000,
			expenses: [{ id: 'e', label: 'x', amount: 1500 }],
			baseSavingsRate: 100 // épargne 100% du surplus (500), mais...
		});
		const acc = mkAccount({ id: 'a', contributions: [{ id: 'c', amount: 800, frequency: 'monthly' }] });
		const b = monthlyBudgetAt(plan, [acc], 0, new Date(2026, 0, 1));
		// 2000 - 1500 - (800 fixe + 500 plan) = -800
		expect(b.remaining).toBeCloseTo(-800, 6);
	});
});

describe('capSavingsToSurplus', () => {
	it('borne l’épargne du plan au surplus réel une fois les versements fixes déduits', () => {
		// Surplus = 2000 - 1000 = 1000. Versement fixe = 700/mois. Plan voudrait
		// épargner 100% du surplus (1000), mais il ne reste que 300 réellement.
		const target = mkAccount({ id: 't', hasYield: false, balance: 0 });
		const fixed = mkAccount({
			id: 'f',
			hasYield: false,
			balance: 0,
			contributions: [{ id: 'c', amount: 700, frequency: 'monthly' }]
		});
		const plan = mkPlan({
			netMonthlyIncome: 2000,
			expenses: [{ id: 'e', label: 'x', amount: 1000 }],
			baseSavingsRate: 100,
			raiseSavingsRate: 100,
			allocation: { t: 1 },
			capSavingsToSurplus: true
		});
		const opts = { start: new Date(2026, 0, 1), plan, allAccounts: [target, fixed] };
		const { per } = simulatePortfolio([target, fixed], 1, opts);
		const t = per.find((p) => p.account.id === 't')!.points[1].balance;
		// L'épargne du plan est plafonnée à 300, pas 1000.
		expect(t).toBeCloseTo(300, 6);
	});

	it('n’a aucun effet quand désactivé (comportement historique)', () => {
		const target = mkAccount({ id: 't', hasYield: false, balance: 0 });
		const plan = mkPlan({
			netMonthlyIncome: 2000,
			expenses: [{ id: 'e', label: 'x', amount: 1000 }],
			baseSavingsRate: 100,
			allocation: { t: 1 },
			capSavingsToSurplus: false
		});
		const opts = { start: new Date(2026, 0, 1), plan, allAccounts: [target] };
		const { per } = simulatePortfolio([target], 1, opts);
		const t = per.find((p) => p.account.id === 't')!.points[1].balance;
		expect(t).toBeCloseTo(1000, 6); // 100% du surplus, non plafonné
	});
});
