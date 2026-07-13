import { describe, expect, it } from 'vitest';
import { migrateAccount, migrateProject } from './migrations';

describe('migrateAccount', () => {
	it('converts a legacy single monthly contribution into the contributions array', () => {
		const legacy = {
			id: 'a1',
			name: 'Livret',
			type: 'livret',
			balance: 1000,
			hasYield: true,
			monthlyContribution: 50,
			createdAt: '2025-03-15T00:00:00.000Z'
		};
		const migrated = migrateAccount(legacy);
		expect(migrated.contributions).toEqual([
			expect.objectContaining({ amount: 50, frequency: 'monthly' })
		]);
	});

	it('defaults new fields (cap, taxable, extrapolateRates) sensibly', () => {
		const legacy = { id: 'a1', name: 'x', balance: 0, createdAt: '2026-01-01T00:00:00.000Z' };
		const migrated = migrateAccount(legacy);
		expect(migrated.cap).toBeUndefined();
		expect(migrated.taxable).toBe(false);
		expect(migrated.taxRatePct).toBe(30);
		expect(migrated.extrapolateRates).toBe(true);
		expect(migrated.compounding).toBe('annual');
	});

	it('derives balanceDate from createdAt when absent, defaulting to the 1st of that month', () => {
		const legacy = { id: 'a1', name: 'x', balance: 0, createdAt: '2025-07-22T10:00:00.000Z' };
		const migrated = migrateAccount(legacy);
		expect(migrated.balanceDate).toBe('2025-07-01');
	});

	it('preserves an explicit balanceDate if already present', () => {
		const legacy = {
			id: 'a1',
			name: 'x',
			balance: 0,
			createdAt: '2025-07-22T10:00:00.000Z',
			balanceDate: '2026-02-01'
		};
		expect(migrateAccount(legacy).balanceDate).toBe('2026-02-01');
	});
});

describe('migrateProject', () => {
	it('fills missing milestonesAchieved with an empty object', () => {
		const legacy = { id: 'p1', name: 'x', targetAmount: 1000, category: 'autre', fundingAccountIds: [] };
		expect(migrateProject(legacy).milestonesAchieved).toEqual({});
	});

	it('preserves existing milestonesAchieved', () => {
		const legacy = {
			id: 'p1',
			name: 'x',
			targetAmount: 1000,
			category: 'autre',
			fundingAccountIds: [],
			milestonesAchieved: { '25': '2026-01-01' }
		};
		expect(migrateProject(legacy).milestonesAchieved).toEqual({ '25': '2026-01-01' });
	});
});
