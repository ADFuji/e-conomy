<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { money, percent, fullDate, durationFromNow } from '$lib/format';
	import {
		projectProjection,
		simulatePortfolio,
		waterfallProjectAllocations,
		requiredMonthlyContribution
	} from '$lib/finance';
	import { PROJECT_CATEGORIES, MILESTONE_FRACTIONS, MILESTONE_KEYS, type Project } from '$lib/types';
	import Modal from '$lib/components/Modal.svelte';
	import ProjectForm from '$lib/components/ProjectForm.svelte';
	import LineChart from '$lib/components/LineChart.svelte';

	let showForm = $state(false);
	let editing = $state<Project | null>(null);
	let confirmDelete = $state<Project | null>(null);
	let solverResults = $state<Record<string, number | null | undefined>>({});

	const horizon = $derived(store.settings.defaultHorizonYears);
	const months = $derived(horizon * 12);
	const simOpts = $derived({ plan: store.incomePlan, lifeEvents: store.lifeEvents, allAccounts: store.accounts });
	const priorityMode = $derived(store.settings.projectAllocationMode === 'priority');

	// En mode priorité, l'épargne totale finance les projets dans l'ordre, en
	// cascade : le premier projet est rempli avant que le suivant ne reçoive quoi
	// que ce soit. Simplification volontaire par rapport aux comptes de financement
	// individuels, pour rester lisible.
	const pool = $derived(simulatePortfolio(store.accounts, months, simOpts));
	const priorityAllocations = $derived(
		priorityMode ? waterfallProjectAllocations(store.projects, pool.total) : []
	);
	function allocationFor(id: string) {
		return priorityAllocations.find((a) => a.projectId === id);
	}

	function catInfo(v: string) {
		return PROJECT_CATEGORIES.find((c) => c.value === v);
	}
	function openNew() {
		editing = null;
		showForm = true;
	}
	function openEdit(p: Project) {
		editing = p;
		showForm = true;
	}
	function setMode(mode: 'shared' | 'priority') {
		store.settings.projectAllocationMode = mode;
	}

	function milestoneDate(p: Project, key: (typeof MILESTONE_KEYS)[number], points: { balance: number; date: Date }[]) {
		const frac = MILESTONE_FRACTIONS[MILESTONE_KEYS.indexOf(key)];
		const threshold = p.targetAmount * frac;
		return points.find((pt) => pt.balance >= threshold)?.date;
	}

	function solve(p: Project, fundingAccounts: { id: string }[]) {
		if (!p.targetDate) return;
		const accs = store.accounts.filter((a) => fundingAccounts.some((f) => f.id === a.id));
		solverResults[p.id] = requiredMonthlyContribution(accs, p.targetAmount, new Date(p.targetDate), simOpts);
	}
</script>

<div class="spread page-head">
	<div>
		<h1>Projets</h1>
		<p class="muted">Vos objectifs d'épargne et la date estimée pour les atteindre.</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}>＋ Nouveau projet</button>
</div>

{#if store.projects.length > 1}
	<div class="card card-pad mode-row">
		<div>
			<span class="section-title">Allocation entre projets</span>
			<p class="faint" style="font-size:12.5px;margin:2px 0 0">
				{#if priorityMode}
					Votre épargne totale finance vos projets dans l'ordre ci-dessous, le premier en priorité.
				{:else}
					Chaque projet est calculé indépendamment à partir de ses comptes de financement.
				{/if}
			</p>
		</div>
		<div class="segmented">
			<button class="seg" class:active={!priorityMode} onclick={() => setMode('shared')}>Indépendant</button>
			<button class="seg" class:active={priorityMode} onclick={() => setMode('priority')}>Par priorité</button>
		</div>
	</div>
{/if}

{#if store.projects.length === 0}
	<div class="empty">
		<span class="emoji">🎯</span>
		<h2 style="margin-bottom:8px">Aucun projet</h2>
		<p style="margin:0 0 18px;max-width:440px;margin-inline:auto">
			Définissez un objectif : achat immobilier, voiture, 6 mois d'épargne de précaution… e-conomy
			estimera quand vous l'atteindrez.
		</p>
		<button class="btn btn-primary" onclick={openNew}>Créer un projet</button>
	</div>
{:else}
	<div class="projects">
		{#each store.projects as p, i (p.id)}
			{@const proj = projectProjection(p, store.accounts, months, simOpts)}
			{@const alloc = allocationFor(p.id)}
			{@const current = priorityMode && alloc ? alloc.current : proj.current}
			{@const progress = priorityMode && alloc ? alloc.progress : proj.progress}
			{@const reachedPoint = priorityMode && alloc ? alloc.reachedPoint : proj.reachedPoint}
			{@const alreadyReached = priorityMode && alloc ? alloc.alreadyReached : proj.alreadyReached}
			<div class="card project" style={`--accent:${p.color}`}>
				<div class="card-pad">
					<div class="pr-top">
						<div class="pr-id">
							{#if priorityMode}
								<div class="reorder">
									<button class="btn btn-icon btn-ghost reorder-btn" disabled={i === 0} onclick={() => store.moveProjectUp(p.id)} aria-label="Monter">▲</button>
									<span class="rank tnum">{i + 1}</span>
									<button class="btn btn-icon btn-ghost reorder-btn" disabled={i === store.projects.length - 1} onclick={() => store.moveProjectDown(p.id)} aria-label="Descendre">▼</button>
								</div>
							{/if}
							<span class="pr-icon">{catInfo(p.category)?.icon}</span>
							<div>
								<div class="pr-name">{p.name}</div>
								<div class="faint" style="font-size:12px">
									Objectif {money(p.targetAmount)}
									{#if p.targetDate}· cible {fullDate(p.targetDate)}{/if}
								</div>
							</div>
						</div>
						<div class="pr-actions">
							<button class="btn btn-icon btn-ghost" onclick={() => openEdit(p)} aria-label="Modifier">✏️</button>
							<button class="btn btn-icon btn-danger" onclick={() => (confirmDelete = p)} aria-label="Supprimer">🗑️</button>
						</div>
					</div>

					<div class="pr-figures">
						<div>
							<div class="section-title">Disponible</div>
							<div class="fig tnum">{money(current)}</div>
						</div>
						<div>
							<div class="section-title">Objectif</div>
							<div class="fig tnum">{money(p.targetAmount)}</div>
						</div>
						<div>
							<div class="section-title">Échéance estimée</div>
							<div class="fig est">
								{#if alreadyReached}
									<span class="pos">Atteint ✓</span>
								{:else if reachedPoint}
									{fullDate(reachedPoint.date)}
								{:else}
									<span class="faint">> {horizon} ans</span>
								{/if}
							</div>
						</div>
					</div>

					<div class="progress" style="margin:4px 0 8px">
						<div style={`width:${Math.min(100, progress * 100)}%;background:${p.color}`}></div>
					</div>
					<div class="spread" style="font-size:12px">
						<span class="faint tnum">{percent(Math.min(100, progress * 100), 0)} atteint</span>
						{#if reachedPoint && !alreadyReached}
							<span class="muted">dans {durationFromNow(reachedPoint.date)}</span>
						{/if}
					</div>

					<!-- Jalons -->
					<div class="milestones">
						{#each MILESTONE_KEYS as key, ki (key)}
							{@const achievedIso = p.milestonesAchieved?.[key]}
							{@const projectedDate = milestoneDate(p, key, proj.points)}
							<div class="milestone" class:done={!!achievedIso || (ki === 3 && alreadyReached)}>
								<span class="ms-pct">{MILESTONE_FRACTIONS[ki] * 100}%</span>
								{#if achievedIso}
									<span class="ms-date pos">✓ {fullDate(achievedIso)}</span>
								{:else if projectedDate}
									<span class="ms-date faint">≈ {fullDate(projectedDate)}</span>
								{:else}
									<span class="ms-date faint">—</span>
								{/if}
							</div>
						{/each}
					</div>

					{#if p.targetDate && !alreadyReached}
						{@const late = !reachedPoint || new Date(reachedPoint.date) > new Date(p.targetDate)}
						<div class="verdict {late ? 'warn' : 'ok'}">
							{#if late}
								⚠️ Au rythme actuel, l'objectif serait atteint après la date cible.
								{#if !reachedPoint}<span class="faint"> (hors horizon de simulation)</span>{/if}
								{#if priorityMode}<span class="faint"> Faites-le monter en priorité pour avancer sa date.</span>{/if}
							{:else}
								✅ Au rythme actuel, l'objectif serait atteint avant la date cible.
							{/if}
						</div>
						{#if late && !priorityMode}
							<button class="btn btn-sm" style="margin-top:8px" onclick={() => solve(p, proj.fundingAccounts)}>
								Combien épargner par mois pour tenir la date ?
							</button>
							{#if solverResults[p.id] !== undefined}
								<p class="solver-result">
									{#if solverResults[p.id] === undefined || solverResults[p.id] === null}
										Date déjà passée, impossible à calculer.
									{:else}
										Il faut environ <strong class="tnum">{money(solverResults[p.id] ?? 0)}</strong> de plus par mois
										(réparti sur {proj.fundingAccounts.length} compte{proj.fundingAccounts.length > 1 ? 's' : ''}) pour tenir la date cible.
									{/if}
								</p>
							{/if}
						{/if}
					{/if}

					<div class="funders">
						{#if proj.fundingAccounts.length === store.accounts.length}
							<span class="badge">Tous les comptes</span>
						{:else}
							{#each proj.fundingAccounts as a (a.id)}
								<span class="badge"><span class="dot" style={`background:${a.color}`}></span>{a.name}</span>
							{/each}
						{/if}
					</div>
				</div>

				<div class="pr-chart">
					<LineChart
						series={[{ label: 'Épargne projetée', color: p.color, points: proj.points, area: true }]}
						height={140}
					/>
				</div>
			</div>
		{/each}
	</div>
{/if}

<Modal bind:open={showForm} title={editing ? 'Modifier le projet' : 'Nouveau projet'} width={600}>
	<ProjectForm project={editing} ondone={() => (showForm = false)} />
</Modal>

<Modal
	bind:open={() => !!confirmDelete, (v) => { if (!v) confirmDelete = null; }}
	title="Supprimer le projet"
	width={420}
>
	{#if confirmDelete}
		<p>Supprimer <strong>{confirmDelete.name}</strong> ? Cette action est définitive.</p>
		<div class="row" style="justify-content:flex-end;margin-top:20px">
			<button class="btn btn-ghost" onclick={() => (confirmDelete = null)}>Annuler</button>
			<button
				class="btn btn-primary"
				style="background:var(--neg);border-color:var(--neg)"
				onclick={() => {
					if (confirmDelete) store.removeProject(confirmDelete.id);
					confirmDelete = null;
				}}
			>
				Supprimer
			</button>
		</div>
	{/if}
</Modal>

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
	.mode-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
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
	.reorder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		margin-right: 2px;
	}
	.reorder-btn {
		width: 20px;
		height: 16px;
		padding: 0;
		font-size: 9px;
		line-height: 1;
	}
	.rank {
		font-size: 11px;
		font-weight: 700;
		color: var(--text-faint);
	}
	.milestones {
		display: flex;
		gap: 8px;
		margin: 10px 0;
	}
	.milestone {
		flex: 1;
		text-align: center;
		padding: 6px 4px;
		border-radius: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.milestone.done {
		border-color: color-mix(in srgb, var(--pos) 40%, var(--border));
		background: color-mix(in srgb, var(--pos) 8%, transparent);
	}
	.ms-pct {
		display: block;
		font-size: 11px;
		font-weight: 700;
		color: var(--text-muted);
	}
	.ms-date {
		display: block;
		font-size: 10.5px;
		margin-top: 2px;
	}
	.solver-result {
		font-size: 12.5px;
		color: var(--text-muted);
		margin: 8px 0 0;
		line-height: 1.5;
	}
	.projects {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 16px;
	}
	.project {
		border-top: 3px solid var(--accent);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.pr-top {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.pr-id {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.pr-icon {
		font-size: 24px;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		border-radius: 11px;
		flex: none;
	}
	.pr-name {
		font-weight: 700;
		font-size: 15px;
	}
	.pr-actions {
		display: flex;
		gap: 2px;
	}
	.pr-figures {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin: 16px 0 14px;
	}
	.fig {
		font-weight: 700;
		font-size: 17px;
		margin-top: 2px;
	}
	.fig.est {
		font-size: 14px;
	}
	.verdict {
		margin-top: 10px;
		font-size: 12.5px;
		padding: 8px 11px;
		border-radius: 9px;
	}
	.verdict.warn {
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: color-mix(in srgb, var(--warn) 80%, var(--text));
	}
	.verdict.ok {
		background: color-mix(in srgb, var(--pos) 12%, transparent);
		color: color-mix(in srgb, var(--pos) 75%, var(--text));
	}
	.funders {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 14px;
	}
	.pr-chart {
		border-top: 1px solid var(--border);
		padding: 14px 8px 4px;
		background: var(--surface-2);
		margin-top: auto;
	}
	@media (max-width: 460px) {
		.projects {
			grid-template-columns: 1fr;
		}
	}
</style>
