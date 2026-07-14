<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { money, percent, fullDate, durationFromNow, monthYear } from '$lib/format';
	import {
		simulatePortfolio,
		projectProjection,
		deflateSeries,
		computeProjectWithdrawals
	} from '$lib/finance';
	import { computeInsights } from '$lib/insights';
	import { PROJECT_CATEGORIES, ACCOUNT_TYPES } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';
	import DonutChart from '$lib/components/DonutChart.svelte';

	const horizon = $derived(store.settings.defaultHorizonYears);
	const months = $derived(horizon * 12);

	let realTerms = $state(false);

	const simOpts = $derived({
		plan: store.incomePlan,
		lifeEvents: store.lifeEvents,
		transferRules: store.transferRules
	});
	// Le but d'un projet est d'être dépensé : on modélise le retrait de chaque
	// projet actif à son échéance pour que le patrimoine projeté reste réaliste.
	const projectWithdrawals = $derived(
		computeProjectWithdrawals(store.projects, store.accounts, months, simOpts)
	);
	const sim = $derived(
		simulatePortfolio(store.accounts, months, {
			...simOpts,
			lifeEvents: [...store.lifeEvents, ...projectWithdrawals]
		})
	);
	const displayedTotal = $derived(
		realTerms ? deflateSeries(sim.total, store.settings.generalInflationPct) : sim.total
	);
	const endPoint = $derived(displayedTotal[displayedTotal.length - 1]);
	const totalInterest = $derived(endPoint ? endPoint.interest : 0);

	const donutSlices = $derived(
		store.accounts.map((a) => ({ label: a.name, value: a.balance, color: a.color }))
	);
	// Un projet terminé a déjà été financé et n'est plus un objectif « actif ».
	const activeProjects = $derived(store.projects.filter((p) => !p.completed));

	function catInfo(v: string) {
		return PROJECT_CATEGORIES.find((c) => c.value === v);
	}
	function typeInfo(v: string) {
		return ACCOUNT_TYPES.find((t) => t.value === v);
	}

	const insights = $derived(
		computeInsights(
			{
				accounts: store.accounts,
				projects: store.projects,
				plan: store.incomePlan,
				lifeEvents: store.lifeEvents,
				transferRules: store.transferRules,
				snapshots: store.snapshots
			},
			{ money, monthYear }
		)
	);
</script>

<div class="page-head">
	<div>
		<h1>Vue d'ensemble</h1>
		<p class="muted">Votre patrimoine et vos objectifs en un coup d'œil.</p>
	</div>
</div>

{#if store.accounts.length === 0}
	<div class="empty">
		<span class="emoji">🌱</span>
		<h2 style="margin-bottom:8px">Bienvenue sur e-conomy</h2>
		<p style="max-width:440px;margin:0 auto 18px">
			Commencez par ajouter vos comptes en banque, puis définissez des projets d'épargne. e-conomy
			simulera vos intérêts composés année après année.
		</p>
		<div class="row" style="justify-content:center">
			<a href="/comptes" class="btn btn-primary">Ajouter un compte</a>
			<button class="btn" onclick={() => store.loadDemo()}>Charger un exemple</button>
		</div>
	</div>
{:else}
	<!-- Statistiques clés -->
	<div class="stats grid">
		<div class="card card-pad stat">
			<span class="section-title">Patrimoine total</span>
			<span class="stat-value">{money(store.totalBalance)}</span>
			<span class="faint">{store.accounts.length} compte{store.accounts.length > 1 ? 's' : ''}</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Épargne mensuelle</span>
			<span class="stat-value">{money(store.monthlySavings)}</span>
			{#if store.incomePlan.enabled}
				<a href="/revenus" class="faint link">dont {money(store.incomeMonthlySavings)} issus des revenus →</a>
			{:else}
				<span class="faint">tous comptes confondus</span>
			{/if}
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Dans {horizon} ans</span>
			<span class="stat-value">{money(endPoint?.balance ?? 0)}</span>
			<span class="pos">+{money(totalInterest)} d'intérêts</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Projets actifs</span>
			<span class="stat-value">{activeProjects.length}</span>
			<a href="/projets" class="faint link">Gérer les projets →</a>
		</div>
	</div>

	{#if insights.length > 0}
		<div class="insights">
			<div class="section-title" style="margin-bottom:10px">🩺 Conseils</div>
			<div class="insight-list">
				{#each insights as ins (ins.id)}
					<a href={ins.href ?? '#'} class="insight sev-{ins.severity}">
						<span class="insight-icon">{ins.icon}</span>
						<span class="insight-body">
							<span class="insight-title">{ins.title}</span>
							<span class="insight-detail">{ins.detail}</span>
						</span>
						{#if ins.href}<span class="insight-arrow">→</span>{/if}
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Projection globale -->
	<div class="card card-pad" style="margin-top:16px">
		<div class="spread" style="margin-bottom:6px">
			<div>
				<h3>Projection du patrimoine</h3>
				<p class="muted" style="font-size:13px;margin:2px 0 0">
					Simulation sur {horizon} ans avec intérêts composés et versements mensuels.
				</p>
			</div>
			<a href="/simulations" class="btn btn-sm">Explorer →</a>
		</div>
		<LineChart
			series={[{ label: 'Patrimoine', color: 'var(--brand)', points: displayedTotal, area: true }]}
			showPrincipal={true}
		/>
		<div class="spread" style="margin-top:10px">
			<div class="legend">
				<span><span class="dot" style="background:var(--brand)"></span> Solde projeté</span>
				<span><span class="dash"></span> Capital versé (hors intérêts)</span>
			</div>
			<label class="toggle-real">
				<input type="checkbox" bind:checked={realTerms} />
				<span>Euros constants</span>
			</label>
		</div>
	</div>

	<div class="two-col">
		<!-- Répartition -->
		<div class="card card-pad">
			<h3 style="margin-bottom:14px">Répartition</h3>
			<div class="repartition">
				<DonutChart slices={donutSlices} />
				<div class="legend-list">
					{#each store.accounts as a (a.id)}
						<div class="legend-item">
							<span class="dot" style={`background:${a.color}`}></span>
							<span class="li-name">{typeInfo(a.type)?.icon} {a.name}</span>
							<span class="li-val tnum">{money(a.balance)}</span>
							<span class="li-pct faint tnum">
								{percent(store.totalBalance > 0 ? (a.balance / store.totalBalance) * 100 : 0, 0)}
							</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Projets -->
		<div class="card card-pad">
			<div class="spread" style="margin-bottom:14px">
				<h3>Objectifs</h3>
				<a href="/projets" class="btn btn-sm">Tous →</a>
			</div>
			{#if activeProjects.length === 0}
				<p class="muted">Aucun projet actif. <a href="/projets" class="link">Définissez un objectif</a>.</p>
			{:else}
				<div class="proj-list">
					{#each activeProjects as p (p.id)}
						{@const proj = projectProjection(p, store.accounts, months, simOpts)}
						<div class="proj">
							<div class="spread">
								<span class="proj-name">{catInfo(p.category)?.icon} {p.name}</span>
								<span class="tnum" style="font-weight:700">
									{money(proj.current)} <span class="faint">/ {money(p.targetAmount)}</span>
								</span>
							</div>
							<div class="progress" style="margin:8px 0 6px">
								<div
									style={`width:${Math.min(100, proj.progress * 100)}%;background:${p.color}`}
								></div>
							</div>
							<div class="spread proj-meta">
								<span class="faint tnum">{percent(Math.min(100, proj.progress * 100), 0)} atteint</span>
								{#if proj.alreadyReached}
									<span class="pos">✓ Objectif atteint</span>
								{:else if proj.reachedPoint}
									<span class="muted">🎯 {fullDate(proj.reachedPoint.date)} · dans {durationFromNow(proj.reachedPoint.date)}</span>
								{:else}
									<span class="faint">Hors horizon ({horizon} ans)</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
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
	.insights {
		margin-top: 16px;
	}
	.insight-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.insight {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--border-strong);
		transition:
			background 0.15s,
			transform 0.05s;
	}
	.insight:hover {
		background: var(--surface-2);
	}
	.insight:active {
		transform: translateY(1px);
	}
	.insight.sev-critical {
		border-left-color: var(--neg);
	}
	.insight.sev-warning {
		border-left-color: var(--warn);
	}
	.insight.sev-info {
		border-left-color: var(--brand);
	}
	.insight-icon {
		font-size: 20px;
		flex: none;
	}
	.insight-body {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.insight-title {
		font-weight: 700;
		font-size: 14px;
	}
	.insight-detail {
		font-size: 13px;
		color: var(--text-muted);
	}
	.insight-arrow {
		margin-left: auto;
		color: var(--text-faint);
		flex: none;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.link {
		font-weight: 600;
	}
	.link:hover {
		color: var(--brand);
	}
	.legend {
		display: flex;
		gap: 18px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.toggle-real {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
	}
	.toggle-real input {
		accent-color: var(--brand);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.dash {
		width: 16px;
		height: 0;
		border-top: 2px dashed var(--text-faint);
		display: inline-block;
	}
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 16px;
	}
	.repartition {
		display: flex;
		align-items: center;
		gap: 20px;
	}
	.legend-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.legend-item {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.li-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.li-val {
		font-weight: 600;
	}
	.li-pct {
		width: 42px;
		text-align: right;
	}
	.proj-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.proj-name {
		font-weight: 600;
	}
	.proj-meta {
		font-size: 12px;
	}
	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
		.two-col {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 560px) {
		.repartition {
			flex-direction: column;
		}
	}
</style>
