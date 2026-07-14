import { describe, expect, it } from 'vitest';
import { computeInsights, type InsightFormatters, type InsightInput } from './insights';
import type { Account, IncomePlan, Project } from './types';

const NOW = new Date(2026, 6, 1); // juillet 2026
const CURRENT_MONTH = '2026-07-01';

const fmt: InsightFormatters = {
	money: (n) => `${Math.round(n)}€`,
	monthYear: (d) => d.toISOString().slice(0, 7)
};

function mkAccount(o: Partial<Account> = {}): Account {
	return {
		id: o.id ?? 'a',
		name: 'Compte',
		type: 'courant',
		balance: 1000,
		balanceDate: CURRENT_MONTH,
		hasYield: false,
		contributions: [],
		compounding: 'annual',
		ratesByYear: {},
		extrapolateRates: true,
		defaultRate: 0,
		color: '#000',
		createdAt: '2026-01-01T00:00:00.000Z',
		...o
	};
}

function mkPlan(o: Partial<IncomePlan> = {}): IncomePlan {
	return {
		enabled: false,
		netMonthlyIncome: 3000,
		grossMonthlyIncome: 3800,
		annualRaisePct: 0,
		raises: [],
		expenses: [],
		expenseInflationPct: 0,
		baseSavingsRate: 0,
		raiseSavingsRate: 0,
		allocation: {},
		capSavingsToSurplus: false,
		...o
	};
}

function mkProject(o: Partial<Project> = {}): Project {
	return {
		id: o.id ?? 'p',
		name: 'Projet',
		targetAmount: 1000,
		category: 'autre',
		color: '#000',
		fundingAccountIds: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		...o
	};
}

function base(o: Partial<InsightInput> = {}): InsightInput {
	return {
		accounts: [],
		projects: [],
		plan: mkPlan(),
		lifeEvents: [],
		transferRules: [],
		snapshots: [{ id: 's', date: CURRENT_MONTH, balances: {} }],
		now: NOW,
		...o
	};
}

function ids(input: InsightInput) {
	return computeInsights(input, fmt).map((i) => i.id);
}

describe('computeInsights', () => {
	it('returns nothing without accounts', () => {
		expect(computeInsights(base(), fmt)).toEqual([]);
	});

	it('flags an account going overdraft from a large planned expense', () => {
		const acc = mkAccount({ id: 'c', balance: 500 });
		const input = base({
			accounts: [acc],
			lifeEvents: [{ id: 'e', label: 'Gros achat', year: 2026, month: 9, amount: -2000, accountId: 'c' }]
		});
		expect(ids(input)).toContain('overdraft');
	});

	it('flags an unsustainable budget when programmed savings exceed the surplus', () => {
		const acc = mkAccount({ id: 'c', contributions: [{ id: 'x', amount: 1500, frequency: 'monthly' }] });
		const plan = mkPlan({ enabled: true, netMonthlyIncome: 2000, expenses: [{ id: 'e', label: 'x', amount: 1500 }] });
		const input = base({ accounts: [acc], plan });
		expect(ids(input)).toContain('budget');
	});

	it('does not flag a healthy budget', () => {
		const acc = mkAccount({ id: 'c', contributions: [{ id: 'x', amount: 100, frequency: 'monthly' }] });
		const plan = mkPlan({ enabled: true, netMonthlyIncome: 3000, expenses: [{ id: 'e', label: 'x', amount: 1000 }] });
		expect(ids(base({ accounts: [acc], plan }))).not.toContain('budget');
	});

	it('flags a capped account with no overflow account that fills up', () => {
		const acc = mkAccount({
			id: 'l',
			type: 'livret',
			hasYield: false,
			balance: 90,
			cap: 100,
			contributions: [{ id: 'x', amount: 50, frequency: 'monthly' }]
		});
		expect(ids(base({ accounts: [acc] }))).toContain('cap-l');
	});

	it('does not flag a capped account that has an overflow target', () => {
		const l = mkAccount({ id: 'l', type: 'livret', hasYield: false, balance: 90, cap: 100, overflowAccountId: 'b', contributions: [{ id: 'x', amount: 50, frequency: 'monthly' }] });
		const b = mkAccount({ id: 'b', hasYield: false, balance: 0 });
		expect(ids(base({ accounts: [l, b] }))).not.toContain('cap-l');
	});

	it('flags idle cash when a yield account exists', () => {
		const cash = mkAccount({ id: 'c', type: 'courant', balance: 20000 });
		const livret = mkAccount({ id: 'l', type: 'livret', hasYield: true, defaultRate: 3, balance: 100 });
		expect(ids(base({ accounts: [cash, livret] }))).toContain('idle-cash');
	});

	it('does not flag idle cash without any yield account', () => {
		const cash = mkAccount({ id: 'c', type: 'courant', balance: 20000 });
		expect(ids(base({ accounts: [cash] }))).not.toContain('idle-cash');
	});

	it('flags a missing pointage', () => {
		expect(ids(base({ accounts: [mkAccount()], snapshots: [] }))).toContain('no-pointage');
	});

	it('flags an old pointage (>= 2 months)', () => {
		const input = base({ accounts: [mkAccount()], snapshots: [{ id: 's', date: '2026-04-01', balances: {} }] });
		expect(ids(input)).toContain('old-pointage');
	});

	it('flags a yield account with no rate for the current year', () => {
		const acc = mkAccount({ id: 'l', type: 'livret', hasYield: true, defaultRate: 0, ratesByYear: {} });
		expect(ids(base({ accounts: [acc] }))).toContain('no-rate');
	});

	it('flags a stale balance older than 3 months', () => {
		const acc = mkAccount({ id: 'c', balanceDate: '2026-01-01' });
		expect(ids(base({ accounts: [acc] }))).toContain('stale-balance');
	});

	it('sorts critical insights before info', () => {
		const acc = mkAccount({ id: 'c', balance: 500, balanceDate: '2026-01-01' });
		const input = base({
			accounts: [acc],
			lifeEvents: [{ id: 'e', label: 'x', year: 2026, month: 9, amount: -2000, accountId: 'c' }]
		});
		const result = computeInsights(input, fmt);
		expect(result[0].severity).toBe('critical');
	});
});
