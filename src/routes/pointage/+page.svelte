<script lang="ts">
	// Pointage mensuel : on enregistre le solde réel de chaque compte, et l'on
	// compare au « prévu » que la simulation aurait annoncé depuis le premier
	// pointage. Construit aussi l'historique du patrimoine (passé réel raccordé
	// à la projection future).
	import { store } from '$lib/store.svelte';
	import { money, percent, monthYear, fullDate } from '$lib/format';
	import { simulatePortfolio, monthsBetween, type SimPoint } from '$lib/finance';
	import { ACCOUNT_TYPES, type Snapshot } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';

	const sortedSnapshots = $derived([...store.snapshots].sort((a, b) => a.date.localeCompare(b.date)));
	const earliest = $derived(sortedSnapshots[0] as Snapshot | undefined);
	const latest = $derived(sortedSnapshots[sortedSnapshots.length - 1] as Snapshot | undefined);

	function totalOf(s: Snapshot): number {
		return store.accounts.reduce((sum, a) => sum + (s.balances[a.id] ?? 0), 0);
	}

	const horizon = $derived(store.settings.defaultHorizonYears);
	const baselineStart = $derived(earliest ? new Date(earliest.date) : new Date());
	// balanceDate est explicitement fixé au 1ᵉʳ pointage : on veut simuler à partir
	// de CE solde à CETTE date, pas laisser le moteur rattraper depuis la date
	// réelle du compte (qui peut être différente).
	const baselineAccounts = $derived(
		earliest
			? store.accounts.map((a) => ({
					...a,
					balance: earliest.balances[a.id] ?? a.balance,
					balanceDate: earliest.date
				}))
			: store.accounts
	);
	const monthsSinceBaseline = $derived(Math.max(0, monthsBetween(baselineStart, new Date())));
	const totalHorizonMonths = $derived(monthsSinceBaseline + horizon * 12);
	const simOpts = $derived({
		start: baselineStart,
		plan: store.incomePlan,
		lifeEvents: store.lifeEvents,
		allAccounts: store.accounts
	});
	const baselineSim = $derived(
		earliest ? simulatePortfolio(baselineAccounts, totalHorizonMonths, simOpts) : null
	);

	// Série « réel » alignée sur les mêmes mois que la projection, par
	// interpolation linéaire entre pointages (plate avant le premier et après le
	// dernier, faute de données).
	const realSeries = $derived.by((): SimPoint[] => {
		if (!baselineSim || sortedSnapshots.length === 0) return [];
		const known = sortedSnapshots.map((s) => ({ m: monthsBetween(baselineStart, new Date(s.date)), v: totalOf(s) }));
		return baselineSim.total.map((p) => {
			let v: number;
			if (p.monthIndex <= known[0].m) v = known[0].v;
			else if (p.monthIndex >= known[known.length - 1].m) v = known[known.length - 1].v;
			else {
				let k = 0;
				while (k < known.length - 1 && !(p.monthIndex >= known[k].m && p.monthIndex <= known[k + 1].m)) k++;
				const span = known[k + 1].m - known[k].m;
				const frac = span === 0 ? 0 : (p.monthIndex - known[k].m) / span;
				v = known[k].v + (known[k + 1].v - known[k].v) * frac;
			}
			return { ...p, balance: v, principal: v, interest: 0 };
		});
	});

	const lastMonthIndex = $derived(latest ? monthsBetween(baselineStart, new Date(latest.date)) : 0);
	const projectedAtLast = $derived(baselineSim?.total[lastMonthIndex]?.balance ?? 0);
	const actualAtLast = $derived(latest ? totalOf(latest) : 0);
	const delta = $derived(actualAtLast - projectedAtLast);

	// Les comptes sont-ils déjà synchronisés avec le dernier pointage ?
	const accountsInSyncWithLatest = $derived.by(() => {
		if (!latest) return true;
		return store.accounts.every((a) => {
			const bal = latest.balances[a.id];
			return bal === undefined || (a.balance === bal && a.balanceDate === latest.date);
		});
	});

	function typeInfo(v: string) {
		return ACCOUNT_TYPES.find((t) => t.value === v);
	}

	// ---- Formulaire d'ajout / édition d'un pointage ----------------------------

	function seedBalances(): Record<string, number> {
		const src = latest?.balances ?? {};
		return Object.fromEntries(store.accounts.map((a) => [a.id, src[a.id] ?? a.balance]));
	}

	let formMonth = $state(new Date().toISOString().slice(0, 7));
	let formBalances = $state<Record<string, number>>(seedBalances());
	let editingId = $state<string | null>(null);

	function resetForm() {
		formMonth = new Date().toISOString().slice(0, 7);
		formBalances = seedBalances();
		editingId = null;
	}

	function editSnapshot(s: Snapshot) {
		formMonth = s.date.slice(0, 7);
		formBalances = { ...s.balances };
		editingId = s.id;
	}

	function submitSnapshot() {
		const date = `${formMonth}-01`;
		const balances: Record<string, number> = {};
		for (const a of store.accounts) balances[a.id] = Number(formBalances[a.id]) || 0;
		store.upsertSnapshot(date, balances);
		resetForm();
	}
</script>

<div class="page-head">
	<h1>Pointage</h1>
	<p class="muted">Enregistrez vos soldes réels chaque mois pour comparer prévu et réel.</p>
</div>

{#if store.accounts.length === 0}
	<div class="empty">
		<span class="emoji">📍</span>
		<h2 style="margin-bottom:8px">Aucun compte à pointer</h2>
		<p style="margin:0 0 18px">Ajoutez d'abord vos comptes pour pouvoir enregistrer un pointage.</p>
		<a href="/comptes" class="btn btn-primary">Ajouter un compte</a>
	</div>
{:else}
	{#if latest}
		<div class="stats grid">
			<div class="card card-pad stat">
				<span class="section-title">Dernier pointage</span>
				<span class="stat-value">{money(actualAtLast)}</span>
				<span class="faint">{monthYear(new Date(latest.date))}</span>
			</div>
			<div class="card card-pad stat">
				<span class="section-title">Prévu à cette date</span>
				<span class="stat-value">{money(projectedAtLast)}</span>
				<span class="faint">selon la projection depuis {earliest ? monthYear(new Date(earliest.date)) : '—'}</span>
			</div>
			<div class="card card-pad stat">
				<span class="section-title">Écart</span>
				<span class="stat-value {delta >= 0 ? 'pos' : 'neg'}">{delta >= 0 ? '+' : ''}{money(delta)}</span>
				<span class="faint">{percent(projectedAtLast > 0 ? (delta / projectedAtLast) * 100 : 0, 1)} vs prévu</span>
			</div>
			<div class="card card-pad stat">
				<span class="section-title">Pointages enregistrés</span>
				<span class="stat-value">{store.snapshots.length}</span>
				<span class="faint">depuis {earliest ? fullDate(earliest.date) : '—'}</span>
			</div>
		</div>

		<!-- Graphique historique + projection -->
		<div class="card card-pad" style="margin-top:16px">
			<h3 style="margin-bottom:14px">Patrimoine réel vs prévu</h3>
			{#if baselineSim}
				<LineChart
					series={[
						{ label: 'Prévu', color: 'var(--brand)', points: baselineSim.total, area: true },
						{ label: 'Réel', color: 'var(--pos)', points: realSeries }
					]}
					height={280}
				/>
			{/if}
			<div class="legend">
				<span><span class="dot" style="background:var(--brand)"></span> Prévu (projection depuis le 1ᵉʳ pointage)</span>
				<span><span class="dot" style="background:var(--pos)"></span> Réel (interpolé entre pointages)</span>
			</div>
		</div>
	{/if}

	{#if latest && !accountsInSyncWithLatest}
		<div class="card card-pad sync-banner" style="margin-top:16px">
			<div>
				<strong>Vos comptes ne reflètent pas encore ce pointage.</strong>
				<p class="muted" style="font-size:13px;margin:2px 0 0">
					Le dashboard utilise le solde actuel des comptes, pas directement le pointage — mettez-les
					à jour pour que tout reste cohérent.
				</p>
			</div>
			<button class="btn btn-primary" onclick={() => store.syncBalancesFromSnapshot(latest.id)}>
				Mettre à jour les comptes
			</button>
		</div>
	{/if}

	<!-- Formulaire -->
	<div class="card card-pad" style="margin-top:16px">
		<h3 style="margin-bottom:14px">{editingId ? 'Modifier le pointage' : 'Nouveau pointage'}</h3>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				submitSnapshot();
			}}
		>
			<div class="field" style="max-width:200px;margin-bottom:14px">
				<label for="snap-month">Mois</label>
				<input id="snap-month" class="input" type="month" bind:value={formMonth} />
			</div>
			<div class="balances-grid">
				{#each store.accounts as a (a.id)}
					<div class="field">
						<label for={`bal-${a.id}`}>{typeInfo(a.type)?.icon} {a.name}</label>
						<div class="input-affix">
							<input
								id={`bal-${a.id}`}
								type="number"
								step="any"
								value={formBalances[a.id] ?? a.balance}
								oninput={(e) => (formBalances[a.id] = parseFloat((e.target as HTMLInputElement).value) || 0)}
							/>
							<span class="affix">{store.settings.currency}</span>
						</div>
					</div>
				{/each}
			</div>
			<div class="actions">
				{#if editingId}
					<button type="button" class="btn btn-ghost" onclick={resetForm}>Annuler</button>
				{/if}
				<button type="submit" class="btn btn-primary">
					{editingId ? 'Enregistrer' : 'Ajouter le pointage'}
				</button>
			</div>
		</form>
	</div>

	<!-- Historique -->
	{#if sortedSnapshots.length > 0}
		<div class="card" style="margin-top:16px;overflow:hidden">
			<div class="card-pad" style="padding-bottom:0">
				<h3>Historique des pointages</h3>
			</div>
			<div class="table-wrap desktop-only">
				<table>
					<thead>
						<tr>
							<th>Mois</th>
							{#each store.accounts as a (a.id)}
								<th class="num">{a.name}</th>
							{/each}
							<th class="num">Total</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each [...sortedSnapshots].reverse() as s (s.id)}
							<tr>
								<td><strong>{monthYear(new Date(s.date))}</strong></td>
								{#each store.accounts as a (a.id)}
									<td class="num tnum">{money(s.balances[a.id] ?? 0)}</td>
								{/each}
								<td class="num tnum" style="font-weight:700">{money(totalOf(s))}</td>
								<td class="num row-actions">
									<button class="btn btn-icon btn-ghost" onclick={() => editSnapshot(s)} aria-label="Modifier">✏️</button>
									<button class="btn btn-icon btn-danger" onclick={() => store.removeSnapshot(s.id)} aria-label="Supprimer">🗑️</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Version mobile : cartes empilées plutôt qu'un tableau large. -->
			<div class="snap-cards mobile-only">
				{#each [...sortedSnapshots].reverse() as s (s.id)}
					<div class="snap-card">
						<div class="spread">
							<strong>{monthYear(new Date(s.date))}</strong>
							<span class="tnum" style="font-weight:700">{money(totalOf(s))}</span>
						</div>
						<div class="snap-card-accounts">
							{#each store.accounts as a (a.id)}
								<div class="snap-card-row">
									<span class="faint">{a.name}</span>
									<span class="tnum">{money(s.balances[a.id] ?? 0)}</span>
								</div>
							{/each}
						</div>
						<div class="row" style="justify-content:flex-end;margin-top:8px">
							<button class="btn btn-sm" onclick={() => editSnapshot(s)}>✏️ Modifier</button>
							<button class="btn btn-sm btn-danger" onclick={() => store.removeSnapshot(s.id)}>🗑️ Supprimer</button>
						</div>
					</div>
				{/each}
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
	.stats {
		grid-template-columns: repeat(4, 1fr);
	}
	.sync-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		border-color: color-mix(in srgb, var(--warn) 35%, var(--border));
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
	.balances-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 12px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 16px;
	}
	.table-wrap {
		overflow-x: auto;
		margin-top: 12px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13.5px;
	}
	th {
		text-align: left;
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-faint);
		padding: 10px 16px;
		font-weight: 700;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	td {
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
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
	.row-actions {
		display: flex;
		gap: 2px;
		justify-content: flex-end;
	}
	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.mobile-only {
		display: none;
	}
	.snap-cards {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
	}
	.snap-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 12px;
		background: var(--surface-2);
	}
	.snap-card-accounts {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
		font-size: 13px;
	}
	.snap-card-row {
		display: flex;
		justify-content: space-between;
	}
	@media (max-width: 700px) {
		.desktop-only {
			display: none;
		}
		.mobile-only {
			display: block;
		}
		.balances-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
