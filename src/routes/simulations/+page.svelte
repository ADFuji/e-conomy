<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { money, percent, monthYear } from '$lib/format';
	import { simulatePortfolio, simulateScenarios, yearlyMilestones, deflateSeries, type SimPoint } from '$lib/finance';
	import { ACCOUNT_TYPES } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';

	const HORIZONS = [1, 2, 5, 10, 20, 30];

	let horizon = $state(store.settings.defaultHorizonYears);
	let selectedIds = $state<string[]>(store.accounts.map((a) => a.id));
	let mode = $state<'total' | 'compare'>('total');
	let showScenarios = $state(false);
	let realTerms = $state(false);
	let showCompare = $state(false);
	let compareExtra = $state(200);
	let compareRateDelta = $state(0);

	// Garde la sélection cohérente si des comptes changent.
	$effect(() => {
		const ids = new Set(store.accounts.map((a) => a.id));
		const filtered = selectedIds.filter((id) => ids.has(id));
		if (filtered.length !== selectedIds.length) selectedIds = filtered;
	});

	const months = $derived(horizon * 12);
	const activeAccounts = $derived(store.accounts.filter((a) => selectedIds.includes(a.id)));
	const simOpts = $derived({ plan: store.incomePlan, lifeEvents: store.lifeEvents, allAccounts: store.accounts });
	const sim = $derived(simulatePortfolio(activeAccounts, months, simOpts));

	const scenarios = $derived(
		showScenarios && mode === 'total'
			? simulateScenarios(activeAccounts, months, simOpts, store.settings.scenarioDeltaPct)
			: null
	);
	const altSim = $derived(
		showCompare && mode === 'total'
			? simulatePortfolio(activeAccounts, months, {
					...simOpts,
					extraMonthly: compareExtra,
					rateDeltaPct: compareRateDelta
				})
			: null
	);

	function disp(points: SimPoint[]): SimPoint[] {
		return realTerms ? deflateSeries(points, store.settings.generalInflationPct) : points;
	}

	const totalSeries = $derived.by(() => {
		const arr = [{ label: 'Total', color: 'var(--brand)', points: disp(sim.total), area: true }];
		if (scenarios) {
			arr.push({ label: 'Optimiste', color: 'var(--pos)', points: disp(scenarios.optimistic.total), area: false });
			arr.push({ label: 'Pessimiste', color: 'var(--warn)', points: disp(scenarios.pessimistic.total), area: false });
		}
		if (altSim) {
			arr.push({ label: 'Scénario B', color: '#8b5cf6', points: disp(altSim.total), area: false });
		}
		return arr;
	});
	const compareSeries = $derived(
		sim.per.map((p) => ({ label: p.account.name, color: p.account.color, points: disp(p.points) }))
	);

	const milestones = $derived(yearlyMilestones(disp(sim.total)));
	const start = $derived(disp(sim.total)[0]);
	const end = $derived(disp(sim.total)[disp(sim.total).length - 1]);

	function typeInfo(v: string) {
		return ACCOUNT_TYPES.find((t) => t.value === v);
	}
	function toggle(id: string) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((x) => x !== id)
			: [...selectedIds, id];
	}
	function allOn() {
		selectedIds = store.accounts.map((a) => a.id);
	}
</script>

<div class="page-head">
	<h1>Simulations</h1>
	<p class="muted">Visualisez la croissance de votre épargne grâce aux intérêts composés.</p>
</div>

{#if store.accounts.length === 0}
	<div class="empty">
		<span class="emoji">📈</span>
		<h2 style="margin-bottom:8px">Rien à simuler pour l'instant</h2>
		<p style="margin:0 0 18px">Ajoutez des comptes avec un rendement pour lancer une simulation.</p>
		<a href="/comptes" class="btn btn-primary">Ajouter un compte</a>
	</div>
{:else}
	<!-- Contrôles -->
	<div class="card card-pad controls">
		<div class="ctrl">
			<span class="section-title">Horizon</span>
			<div class="segmented">
				{#each HORIZONS as h}
					<button class="seg" class:active={horizon === h} onclick={() => (horizon = h)}>
						{h} an{h > 1 ? 's' : ''}
					</button>
				{/each}
			</div>
		</div>

		<div class="ctrl">
			<span class="section-title">Affichage</span>
			<div class="segmented">
				<button class="seg" class:active={mode === 'total'} onclick={() => (mode = 'total')}>Total cumulé</button>
				<button class="seg" class:active={mode === 'compare'} onclick={() => (mode = 'compare')}>Par compte</button>
			</div>
		</div>

		<div class="ctrl grow">
			<div class="spread">
				<span class="section-title">Comptes inclus</span>
				<button class="btn btn-sm btn-ghost" onclick={allOn}>Tout sélectionner</button>
			</div>
			<div class="acc-chips">
				{#each store.accounts as a (a.id)}
					<button class="chip" class:active={selectedIds.includes(a.id)} onclick={() => toggle(a.id)}>
						<span class="dot" style={`background:${a.color}`}></span>
						{typeInfo(a.type)?.icon}
						{a.name}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Options avancées -->
	<div class="card card-pad options-row">
		<label class="opt">
			<input type="checkbox" bind:checked={realTerms} />
			<span>Euros constants (inflation {percent(store.settings.generalInflationPct, 1)}/an)</span>
		</label>
		{#if mode === 'total'}
			<label class="opt">
				<input type="checkbox" bind:checked={showScenarios} />
				<span>Scénarios optimiste / pessimiste (±{percent(store.settings.scenarioDeltaPct, 1)})</span>
			</label>
			<label class="opt">
				<input type="checkbox" bind:checked={showCompare} />
				<span>Comparer un scénario B</span>
			</label>
		{/if}
	</div>

	{#if showCompare && mode === 'total'}
		<div class="card card-pad compare-panel">
			<div class="section-title" style="margin-bottom:10px">Scénario B — et si…</div>
			<div class="compare-fields">
				<div class="field">
					<label for="cmp-extra">Versement mensuel supplémentaire</label>
					<div class="input-affix" style="max-width:200px">
						<input id="cmp-extra" type="number" step="any" bind:value={compareExtra} />
						<span class="affix">{store.settings.currency}</span>
					</div>
				</div>
				<div class="field">
					<label for="cmp-rate">Écart de taux</label>
					<div class="input-affix" style="max-width:160px">
						<input id="cmp-rate" type="number" step="0.1" bind:value={compareRateDelta} />
						<span class="affix">pts</span>
					</div>
				</div>
			</div>
			{#if altSim}
				<p class="muted" style="font-size:13px;margin:10px 0 0">
					Scénario B à {horizon} ans : <strong class="tnum">{money(disp(altSim.total)[disp(altSim.total).length - 1]?.balance ?? 0)}</strong>
					<span class="faint">
						({money((disp(altSim.total)[disp(altSim.total).length - 1]?.balance ?? 0) - (end?.balance ?? 0))} vs actuel)
					</span>
				</p>
			{/if}
		</div>
	{/if}

	<!-- Résumé -->
	<div class="summary grid">
		<div class="card card-pad stat">
			<span class="section-title">Aujourd'hui</span>
			<span class="stat-value">{money(start?.balance ?? 0)}</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Dans {horizon} an{horizon > 1 ? 's' : ''}</span>
			<span class="stat-value">{money(end?.balance ?? 0)}</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Versements cumulés</span>
			<span class="stat-value">{money((end?.principal ?? 0) - (start?.balance ?? 0))}</span>
			<span class="faint">épargne ajoutée</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Intérêts générés</span>
			<span class="stat-value pos">+{money(end?.interest ?? 0)}</span>
			<span class="faint">
				{percent(start && start.balance > 0 && end ? ((end.balance / (end.principal || 1) - 1) * 100) : 0, 1)} de gain
			</span>
		</div>
	</div>

	<!-- Graphique -->
	<div class="card card-pad" style="margin-top:16px">
		<h3 style="margin-bottom:14px">
			{mode === 'total' ? 'Évolution du patrimoine' : 'Comparaison par compte'}
		</h3>
		{#if activeAccounts.length === 0}
			<p class="muted">Sélectionnez au moins un compte.</p>
		{:else}
			<LineChart
				series={mode === 'total' ? totalSeries : compareSeries}
				height={320}
				showPrincipal={mode === 'total' && !scenarios && !altSim}
			/>
			{#if mode === 'compare' || totalSeries.length > 1}
				<div class="legend">
					{#each mode === 'total' ? totalSeries : compareSeries as s (s.label)}
						<span><span class="dot" style={`background:${s.color}`}></span> {s.label}</span>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Tableau annuel -->
	{#if activeAccounts.length > 0}
		<div class="card" style="margin-top:16px;overflow:hidden">
			<div class="card-pad" style="padding-bottom:0">
				<h3>Détail année par année</h3>
			</div>
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Échéance</th>
							<th class="num">Capital versé</th>
							<th class="num">Intérêts cumulés</th>
							<th class="num">Solde total</th>
							<th class="num">Part d'intérêts</th>
						</tr>
					</thead>
					<tbody>
						{#each milestones as m (m.monthIndex)}
							<tr>
								<td>
									<strong>{m.monthIndex === 0 ? "Aujourd'hui" : `+${m.monthIndex / 12} an${m.monthIndex / 12 > 1 ? 's' : ''}`}</strong>
									<span class="faint" style="margin-left:8px">{monthYear(m.date)}</span>
								</td>
								<td class="num tnum">{money(m.principal)}</td>
								<td class="num tnum pos">{m.interest > 0 ? '+' : ''}{money(m.interest)}</td>
								<td class="num tnum" style="font-weight:700">{money(m.balance)}</td>
								<td class="num tnum faint">{percent(m.balance > 0 ? (m.interest / m.balance) * 100 : 0, 1)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
{/if}

<style>
	.page-head {
		margin-bottom: 20px;
	}
	.page-head h1 {
		font-size: 26px;
	}
	.page-head p {
		margin: 4px 0 0;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		align-items: flex-start;
	}
	.ctrl {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ctrl.grow {
		flex: 1;
		min-width: 260px;
	}
	.options-row {
		margin-top: 12px;
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}
	.opt {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}
	.opt input {
		accent-color: var(--brand);
	}
	.compare-panel {
		margin-top: 12px;
	}
	.compare-fields {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}
	.segmented {
		display: inline-flex;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 3px;
		gap: 2px;
	}
	.seg {
		border: none;
		background: transparent;
		padding: 7px 13px;
		border-radius: 7px;
		font-weight: 600;
		font-size: 13px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.seg.active {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	.acc-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.acc-chips .chip {
		cursor: pointer;
	}
	.summary {
		grid-template-columns: repeat(4, 1fr);
		margin-top: 16px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		margin-top: 12px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.table-wrap {
		overflow-x: auto;
		margin-top: 12px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th {
		text-align: left;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		padding: 10px 20px;
		font-weight: 700;
		border-bottom: 1px solid var(--border);
	}
	td {
		padding: 12px 20px;
		border-bottom: 1px solid var(--border);
	}
	tr:last-child td {
		border-bottom: none;
	}
	tbody tr:hover {
		background: var(--surface-2);
	}
	.num {
		text-align: right;
	}
	@media (max-width: 900px) {
		.summary {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
