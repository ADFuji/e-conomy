import { describe, expect, it } from 'vitest';
import type { Account, IncomePlan, Project } from './types';
import {
	applyTaxToFactor,
	catchUpAccount,
	catchUpAccounts,
	deflateSeries,
	estimateRate,
	linearFit,
	monthlyGrowthFactor,
	monthsBetween,
	requiredMonthlyContribution,
	simulatePortfolio,
	waterfallProjectAllocations
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
			annualRaisePct: 0,
			raises: [],
			expenses: [],
			expenseInflationPct: 0,
			baseSavingsRate: 100,
			raiseSavingsRate: 100,
			allocation: {}
		};
		const acc = mkAccount({ hasYield: false, balance: 0 });
		const { total } = simulatePortfolio([acc], 6, { start: new Date(2026, 0, 1), plan });
		expect(total[6].balance).toBe(0);
	});
});
