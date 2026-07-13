<script lang="ts">
	// Graphique en courbes/aires multi-séries, SVG pur (aucune dépendance).
	import { moneyCompact, money, monthYear } from '$lib/format';
	import type { SimPoint } from '$lib/finance';

	interface Series {
		label: string;
		color: string;
		points: SimPoint[];
		/** true = aire empilée sous la courbe. */
		area?: boolean;
	}

	let {
		series,
		height = 280,
		showPrincipal = false
	}: { series: Series[]; height?: number; showPrincipal?: boolean } = $props();

	// Identifiant unique par instance : les ids de dégradé doivent être sûrs pour
	// url(#...) (les libellés peuvent contenir espaces/apostrophes).
	const cid = Math.random().toString(36).slice(2, 8);
	const gradId = (i: number) => `grad-${cid}-${i}`;

	const padL = 8;
	const padR = 8;
	const padT = 16;
	const padB = 28;
	const W = 800; // viewBox width (responsive via CSS)

	let hover = $state<number | null>(null);

	const nbPoints = $derived(series[0]?.points.length ?? 0);

	const maxVal = $derived(
		Math.max(
			1,
			...series.flatMap((s) => s.points.map((p) => p.balance)),
			showPrincipal ? Math.max(...(series[0]?.points.map((p) => p.principal) ?? [0])) : 0
		)
	);

	// Échelle « jolie » pour le haut de l'axe.
	function niceMax(v: number): number {
		const pow = Math.pow(10, Math.floor(Math.log10(v)));
		const n = v / pow;
		const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
		return step * pow;
	}
	const top = $derived(niceMax(maxVal));

	function x(i: number): number {
		if (nbPoints <= 1) return padL;
		return padL + (i / (nbPoints - 1)) * (W - padL - padR);
	}
	function y(v: number): number {
		return padT + (1 - v / top) * (height - padT - padB);
	}

	function linePath(pts: SimPoint[], key: 'balance' | 'principal' = 'balance'): string {
		return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
	}
	function areaPath(pts: SimPoint[]): string {
		const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
		return `${line} L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
	}

	// Graduations Y (4 niveaux).
	const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: top * f, y: y(top * f) })));

	// Graduations X : jalons annuels.
	const xTicks = $derived.by(() => {
		const pts = series[0]?.points ?? [];
		const ticks: { i: number; label: string }[] = [];
		const stepMonths = pts.length > 145 ? 60 : pts.length > 73 ? 24 : 12;
		for (let i = 0; i < pts.length; i += stepMonths) {
			ticks.push({ i, label: monthYear(pts[i].date) });
		}
		return ticks;
	});

	function onMove(e: PointerEvent) {
		const svg = e.currentTarget as SVGElement;
		const rect = svg.getBoundingClientRect();
		const px = ((e.clientX - rect.left) / rect.width) * W;
		const frac = (px - padL) / (W - padL - padR);
		hover = Math.max(0, Math.min(nbPoints - 1, Math.round(frac * (nbPoints - 1))));
	}
</script>

<div class="chart">
	<svg
		viewBox={`0 0 ${W} ${height}`}
		preserveAspectRatio="none"
		role="img"
		aria-label="Projection"
		onpointermove={onMove}
		onpointerleave={() => (hover = null)}
	>
		<!-- Grille -->
		{#each yTicks as t}
			<line x1={padL} x2={W - padR} y1={t.y} y2={t.y} class="grid-line" />
		{/each}

		<!-- Aires -->
		{#each series as s, i (s.label)}
			{#if s.area}
				<defs>
					<linearGradient id={gradId(i)} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color={s.color} stop-opacity="0.28" />
						<stop offset="100%" stop-color={s.color} stop-opacity="0.02" />
					</linearGradient>
				</defs>
				<path d={areaPath(s.points)} fill={`url(#${gradId(i)})`} />
			{/if}
		{/each}

		<!-- Capital versé (référence) -->
		{#if showPrincipal && series.length === 1}
			<path
				d={linePath(series[0].points, 'principal')}
				fill="none"
				stroke="var(--text-faint)"
				stroke-width="1.5"
				stroke-dasharray="4 4"
				vector-effect="non-scaling-stroke"
			/>
		{/if}

		<!-- Courbes -->
		{#each series as s (s.label)}
			<path
				d={linePath(s.points)}
				fill="none"
				stroke={s.color}
				stroke-width="2.5"
				stroke-linejoin="round"
				vector-effect="non-scaling-stroke"
			/>
		{/each}

		<!-- Curseur -->
		{#if hover !== null}
			<line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} class="cursor-line" />
			{#each series as s (s.label)}
				<circle cx={x(hover)} cy={y(s.points[hover].balance)} r="4" fill={s.color} stroke="var(--surface)" stroke-width="2" />
			{/each}
		{/if}
	</svg>

	<!-- Étiquettes Y en overlay HTML (non déformées) -->
	<div class="y-labels">
		{#each yTicks as t}
			<span style={`top:${(t.y / height) * 100}%`}>{moneyCompact(t.v)}</span>
		{/each}
	</div>

	<!-- Étiquettes X -->
	<div class="x-labels">
		{#each xTicks as t}
			<span style={`left:${(x(t.i) / W) * 100}%`}>{t.label}</span>
		{/each}
	</div>

	<!-- Tooltip -->
	{#if hover !== null && series[0]?.points[hover]}
		<div class="tooltip" style={`left:${(x(hover) / W) * 100}%`}>
			<div class="tt-date">{monthYear(series[0].points[hover].date)}</div>
			{#each series as s (s.label)}
				<div class="tt-row">
					<span class="dot" style={`background:${s.color}`}></span>
					<span class="tt-label">{s.label}</span>
					<span class="tt-val">{money(s.points[hover].balance)}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		padding-left: 52px;
		padding-bottom: 22px;
	}
	svg {
		width: 100%;
		display: block;
		overflow: visible;
	}
	.grid-line {
		stroke: var(--border);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.cursor-line {
		stroke: var(--border-strong);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.y-labels span {
		position: absolute;
		left: 0;
		transform: translateY(-50%);
		font-size: 11px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
		width: 48px;
		text-align: right;
	}
	.x-labels {
		position: absolute;
		left: 52px;
		right: 8px;
		bottom: 0;
		height: 20px;
	}
	.x-labels span {
		position: absolute;
		transform: translateX(-50%);
		font-size: 11px;
		color: var(--text-faint);
		white-space: nowrap;
	}
	.tooltip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		background: var(--bg-elevated);
		border: 1px solid var(--border-strong);
		border-radius: 10px;
		box-shadow: var(--shadow);
		padding: 8px 10px;
		pointer-events: none;
		min-width: 150px;
		z-index: 5;
	}
	.tt-date {
		font-size: 11px;
		color: var(--text-muted);
		margin-bottom: 4px;
		font-weight: 600;
	}
	.tt-row {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		padding: 1px 0;
	}
	.tt-label {
		color: var(--text-muted);
		flex: 1;
	}
	.tt-val {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
