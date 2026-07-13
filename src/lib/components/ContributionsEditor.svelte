<script lang="ts">
	// Éditeur de versements programmés (mensuels et/ou annuels avec date).
	import { MONTHS, type Contribution, type ContributionFrequency } from '$lib/types';
	import { store } from '$lib/store.svelte';

	let { contributions = $bindable([]) }: { contributions: Contribution[] } = $props();

	function uid(): string {
		return crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
	}

	function add(frequency: ContributionFrequency) {
		const base: Contribution = { id: uid(), amount: 100, frequency };
		if (frequency === 'annual') {
			base.month = 12;
			base.day = 1;
		}
		contributions = [...contributions, base];
	}

	function remove(id: string) {
		contributions = contributions.filter((c) => c.id !== id);
	}

	function update(id: string, patch: Partial<Contribution>) {
		contributions = contributions.map((c) => (c.id === id ? { ...c, ...patch } : c));
	}
</script>

<div class="contribs">
	{#if contributions.length === 0}
		<p class="hint" style="margin:0">Aucun versement programmé.</p>
	{/if}

	{#each contributions as c (c.id)}
		<div class="contrib-row">
			<div class="input-affix amount">
				<input
					type="number"
					step="any"
					value={c.amount}
					oninput={(e) => update(c.id, { amount: parseFloat((e.target as HTMLInputElement).value) || 0 })}
					aria-label="Montant"
				/>
				<span class="affix">{store.settings.currency}</span>
			</div>

			<select
				class="select freq"
				value={c.frequency}
				onchange={(e) => {
					const f = (e.target as HTMLSelectElement).value as ContributionFrequency;
					update(c.id, { frequency: f, month: f === 'annual' ? (c.month ?? 12) : undefined });
				}}
			>
				<option value="monthly">par mois</option>
				<option value="annual">par an</option>
			</select>

			{#if c.frequency === 'annual'}
				<span class="in">en</span>
				<select
					class="select month"
					value={c.month ?? 12}
					onchange={(e) => update(c.id, { month: Number((e.target as HTMLSelectElement).value) })}
				>
					{#each MONTHS as m, i}
						<option value={i + 1}>{m}</option>
					{/each}
				</select>
			{/if}

			<button
				type="button"
				class="btn btn-icon btn-ghost"
				onclick={() => remove(c.id)}
				aria-label="Retirer le versement"
			>
				✕
			</button>
		</div>
	{/each}

	<div class="add-row">
		<button type="button" class="btn btn-sm" onclick={() => add('monthly')}>＋ Versement mensuel</button>
		<button type="button" class="btn btn-sm" onclick={() => add('annual')}>＋ Versement annuel</button>
	</div>
</div>

<style>
	.contribs {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.contrib-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.amount {
		max-width: 150px;
		flex: 1 1 120px;
	}
	.freq {
		width: auto;
		flex: none;
	}
	.month {
		width: auto;
		flex: none;
	}
	.in {
		color: var(--text-muted);
		font-size: 13px;
	}
	.add-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 2px;
	}
</style>
