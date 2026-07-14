import { describe, expect, it } from 'vitest';
import { buildTimeline, type TimelineInput } from './timeline';
import { DEFAULT_SETTINGS } from './types';
import type { Account, IncomePlan, Project } from './types';

const NOW = new Date(2026, 0, 1); // janvier 2026

function mkAccount(o: Partial<Account> = {}): Account {
	return {
		id: o.id ?? 'a',
		name: 'Compte',
		type: 'courant',
		balance: 1000,
		balanceDate: '2026-01-01',
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

function input(o: Partial<TimelineInput> = {}): TimelineInput {
	return {
		accounts: [],
		projects: [],
		plan: mkPlan(),
		lifeEvents: [],
		transferRules: [],
		settings: DEFAULT_SETTINGS,
		now: NOW,
		...o
	};
}

describe('buildTimeline', () => {
	it('returns nothing without accounts', () => {
		expect(buildTimeline(input(), 24)).toEqual([]);
	});

	it('places events in chronological order', () => {
		const acc = mkAccount({ id: 'c', balance: 10000 });
		const plan = mkPlan({ raises: [{ id: 'r', year: 2028, amount: 300 }] });
		const evts = buildTimeline(
			input({
				accounts: [acc],
				plan,
				lifeEvents: [{ id: 'e', label: 'Prime', year: 2027, month: 6, amount: 500, accountId: 'c' }]
			}),
			60
		);
		const dates = evts.map((e) => e.date.getTime());
		expect(dates).toEqual([...dates].sort((a, b) => a - b));
		expect(evts.some((e) => e.kind === 'life')).toBe(true);
		expect(evts.some((e) => e.kind === 'raise')).toBe(true);
	});

	it('groups a project withdrawal into a single dated event', () => {
		const acc = mkAccount({ id: 'c', balance: 5000 });
		const project = mkProject({ id: 'proj1', name: 'Voyage', targetAmount: 2000, targetDate: '2026-08-01', fundingAccountIds: ['c'] });
		const evts = buildTimeline(input({ accounts: [acc], projects: [project] }), 24);
		const withdrawal = evts.find((e) => e.kind === 'project' && e.title.includes('Voyage') && e.amount);
		expect(withdrawal).toBeTruthy();
		expect(withdrawal!.amount).toBeCloseTo(-2000, 6);
		expect(withdrawal!.detail).toContain('Compte');
	});

	it('emits an annual transfer-rule occurrence within the horizon', () => {
		const from = mkAccount({ id: 'f', balance: 10000 });
		const to = mkAccount({ id: 't', balance: 0 });
		const evts = buildTimeline(
			input({
				accounts: [from, to],
				transferRules: [
					{ id: 'r', label: 'PEE', fromAccountId: 'f', toAccountId: 't', frequency: 'annual', month: 12, enabled: true }
				]
			}),
			24
		);
		const t = evts.filter((e) => e.kind === 'transfer');
		expect(t.length).toBeGreaterThanOrEqual(1);
		expect(t[0].detail).toContain('→');
	});

	it('excludes events beyond the horizon', () => {
		const acc = mkAccount({ id: 'c', balance: 1000 });
		const evts = buildTimeline(
			input({
				accounts: [acc],
				lifeEvents: [{ id: 'e', label: 'loin', year: 2035, month: 1, amount: 100, accountId: 'c' }]
			}),
			24
		);
		expect(evts.some((e) => e.id === 'life-e')).toBe(false);
	});
});
