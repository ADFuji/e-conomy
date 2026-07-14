<script lang="ts">
	// Timeline financière : feuille de route chronologique de tout ce qui va se
	// passer (retraits de projets, virements, augmentations, plafonds, échéances,
	// indépendance financière).
	import { store } from '$lib/store.svelte';
	import { money, monthYear } from '$lib/format';
	import { buildTimeline, type TimelineEvent } from '$lib/timeline';

	const HORIZONS = [1, 2, 5, 10];
	let horizonYears = $state(Math.min(5, store.settings.defaultHorizonYears));

	const events = $derived(
		buildTimeline(
			{
				accounts: store.accounts,
				projects: store.projects,
				plan: store.incomePlan,
				lifeEvents: store.lifeEvents,
				transferRules: store.transferRules,
				settings: store.settings
			},
			horizonYears * 12
		)
	);

	// Groupe les événements par année puis par mois, pour un affichage aéré.
	interface MonthGroup {
		key: string;
		label: string;
		events: TimelineEvent[];
	}
	interface YearGroup {
		year: number;
		months: MonthGroup[];
	}
	const grouped = $derived.by((): YearGroup[] => {
		const years = new Map<number, Map<string, TimelineEvent[]>>();
		for (const e of events) {
			const y = e.date.getFullYear();
			const mKey = `${y}-${e.date.getMonth()}`;
			if (!years.has(y)) years.set(y, new Map());
			const months = years.get(y)!;
			if (!months.has(mKey)) months.set(mKey, []);
			months.get(mKey)!.push(e);
		}
		return [...years.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([year, months]) => ({
				year,
				months: [...months.entries()].map(([key, evs]) => ({
					key,
					label: monthYear(evs[0].date),
					events: evs
				}))
			}));
	});
</script>

<div class="spread page-head">
	<div>
		<h1>Timeline</h1>
		<p class="muted">Votre feuille de route financière des prochaines années.</p>
	</div>
	<div class="segmented">
		{#each HORIZONS as h}
			<button class="seg" class:active={horizonYears === h} onclick={() => (horizonYears = h)}>
				{h} an{h > 1 ? 's' : ''}
			</button>
		{/each}
	</div>
</div>

{#if store.accounts.length === 0}
	<div class="empty">
		<span class="emoji">📅</span>
		<h2 style="margin-bottom:8px">Rien à planifier pour l'instant</h2>
		<p style="margin:0 0 18px">Ajoutez des comptes et des projets pour voir votre feuille de route.</p>
		<a href="/comptes" class="btn btn-primary">Ajouter un compte</a>
	</div>
{:else if events.length === 0}
	<div class="empty">
		<span class="emoji">🌤️</span>
		<h2 style="margin-bottom:8px">Aucun événement sur {horizonYears} an{horizonYears > 1 ? 's' : ''}</h2>
		<p style="margin:0">Définissez des projets, des augmentations ou des événements de vie pour peupler votre timeline.</p>
	</div>
{:else}
	<div class="timeline">
		{#each grouped as yg (yg.year)}
			<div class="year-block">
				<div class="year-label">{yg.year}</div>
				{#each yg.months as mg (mg.key)}
					<div class="month-block">
						<div class="month-label">{mg.label}</div>
						<div class="events">
							{#each mg.events as e (e.id)}
								<a href={e.href ?? '#'} class="event kind-{e.kind}">
									<span class="event-dot"></span>
									<span class="event-icon">{e.icon}</span>
									<span class="event-body">
										<span class="event-title">{e.title}</span>
										{#if e.detail}<span class="event-detail">{e.detail}</span>{/if}
									</span>
									{#if e.amount !== undefined}
										<span class="event-amount {e.amount >= 0 ? 'pos' : 'neg'}">
											{e.amount >= 0 ? '+' : ''}{money(e.amount)}
										</span>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}

<style>
	.page-head {
		margin-bottom: 20px;
		align-items: flex-start;
	}
	.page-head h1 {
		font-size: 26px;
	}
	.page-head p {
		margin: 4px 0 0;
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
	.year-block {
		margin-bottom: 8px;
	}
	.year-label {
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--text);
		padding: 8px 0;
		position: sticky;
		top: 62px;
		background: var(--bg);
		z-index: 1;
	}
	.month-block {
		margin-bottom: 12px;
	}
	.month-label {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		margin: 4px 0 6px;
	}
	.events {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-left: 2px solid var(--border);
		padding-left: 16px;
		margin-left: 6px;
	}
	.event {
		position: relative;
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 10px 12px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--border);
		transition: background 0.15s;
	}
	.event:hover {
		background: var(--surface-2);
	}
	.event-dot {
		position: absolute;
		left: -23px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--border-strong);
		border: 2px solid var(--bg);
	}
	.event.kind-fi .event-dot,
	.event.kind-project .event-dot {
		background: var(--pos);
	}
	.event.kind-deadline .event-dot {
		background: var(--warn);
	}
	.event.kind-life .event-dot {
		background: var(--brand);
	}
	.event-icon {
		font-size: 18px;
		flex: none;
	}
	.event-body {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}
	.event-title {
		font-weight: 600;
		font-size: 14px;
	}
	.event-detail {
		font-size: 12.5px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.event-amount {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		flex: none;
		font-size: 14px;
	}
</style>
