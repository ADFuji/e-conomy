<script lang="ts">
	// Éditeur de taux d'intérêt par année civile (passé et futur).
	import { estimateRate } from '$lib/finance';
	import { percent } from '$lib/format';

	let {
		ratesByYear = $bindable({}),
		defaultRate = $bindable(0),
		extrapolateRates = $bindable(true)
	}: {
		ratesByYear: Record<number, number>;
		defaultRate: number;
		extrapolateRates: boolean;
	} = $props();

	const thisYear = new Date().getFullYear();

	// Années saisies, triées.
	const years = $derived(
		Object.keys(ratesByYear)
			.map(Number)
			.sort((a, b) => a - b)
	);

	const canExtrapolate = $derived(years.length >= 2);

	// Aperçu : taux estimé pour l'année précédant/suivant la plage saisie.
	const preview = $derived.by(() => {
		if (!extrapolateRates || !canExtrapolate) return null;
		const before = years[0] - 1;
		const after = years[years.length - 1] + 1;
		return {
			before: { year: before, rate: estimateRate(ratesByYear, defaultRate, true, before) },
			after: { year: after, rate: estimateRate(ratesByYear, defaultRate, true, after) }
		};
	});

	function addYear(y: number) {
		if (y in ratesByYear) return;
		// Amorce la nouvelle année avec l'estimation courante (tendance ou repli).
		const seed = years.length
			? Number(estimateRate(ratesByYear, defaultRate, extrapolateRates, y).toFixed(2))
			: defaultRate;
		ratesByYear = { ...ratesByYear, [y]: seed };
	}

	function addPrev() {
		addYear(years.length ? years[0] - 1 : thisYear);
	}
	function addNext() {
		addYear(years.length ? years[years.length - 1] + 1 : thisYear);
	}

	function removeYear(y: number) {
		const copy = { ...ratesByYear };
		delete copy[y];
		ratesByYear = copy;
	}

	function setRate(y: number, v: number) {
		ratesByYear = { ...ratesByYear, [y]: v };
	}
</script>

<div class="rates">
	<div class="add-bar">
		<button type="button" class="btn btn-sm" onclick={addPrev}>← Année précédente</button>
		<span class="faint" style="font-size:12px">Ajoutez des années passées ou futures</span>
		<button type="button" class="btn btn-sm" onclick={addNext}>Année suivante →</button>
	</div>

	{#if years.length > 0}
		<div class="year-list">
			{#each years as y (y)}
				<div class="year-row" class:past={y < thisYear} class:current={y === thisYear}>
					<span class="year">
						{y}
						{#if y === thisYear}<span class="tag">actuelle</span>{/if}
						{#if y < thisYear}<span class="tag past-tag">passée</span>{/if}
					</span>
					<div class="input-affix">
						<input
							type="number"
							step="0.05"
							value={ratesByYear[y]}
							oninput={(e) => setRate(y, parseFloat((e.target as HTMLInputElement).value) || 0)}
						/>
						<span class="affix">%</span>
					</div>
					<button class="btn btn-icon btn-ghost" onclick={() => removeYear(y)} aria-label={`Retirer ${y}`}>
						✕
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<p class="hint" style="margin:0">Aucun taux saisi — le taux de repli ci-dessous s'applique à toutes les années.</p>
	{/if}

	<label class="toggle" class:disabled={!canExtrapolate}>
		<input type="checkbox" bind:checked={extrapolateRates} disabled={!canExtrapolate} />
		<span>
			Estimer les années manquantes selon la tendance
			<span class="faint">(tangente de l'évolution)</span>
		</span>
	</label>

	{#if extrapolateRates && canExtrapolate}
		<div class="preview">
			📈 Années non renseignées estimées par régression linéaire.
			{#if preview}
				Ex. {preview.before.year} ≈ <strong>{percent(preview.before.rate)}</strong>,
				{preview.after.year} ≈ <strong>{percent(preview.after.rate)}</strong>.
			{/if}
		</div>
	{:else}
		<div class="field">
			<label for="defrate">Taux de repli (années non renseignées)</label>
			<div class="input-affix" style="max-width:180px">
				<input id="defrate" type="number" step="0.05" bind:value={defaultRate} placeholder="0" />
				<span class="affix">% / an</span>
			</div>
			{#if !canExtrapolate}
				<span class="hint">Saisissez au moins 2 années pour activer l'estimation par tendance.</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.rates {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.add-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.year-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.year-row {
		display: grid;
		grid-template-columns: 110px 1fr 36px;
		align-items: center;
		gap: 10px;
	}
	.year {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.year-row.current .year {
		color: var(--text);
	}
	.tag {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--brand);
	}
	.past-tag {
		color: var(--text-faint);
	}
	.toggle {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.toggle.disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.toggle input {
		width: 18px;
		height: 18px;
		margin-top: 1px;
		accent-color: var(--brand);
	}
	.preview {
		font-size: 12.5px;
		color: var(--text-muted);
		background: var(--brand-soft);
		border-radius: 9px;
		padding: 9px 11px;
		line-height: 1.5;
	}
</style>
