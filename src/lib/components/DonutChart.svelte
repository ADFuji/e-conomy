<script lang="ts">
	// Donut de répartition, SVG pur.
	import { money } from '$lib/format';

	interface Slice {
		label: string;
		value: number;
		color: string;
	}

	let { slices, size = 180 }: { slices: Slice[]; size?: number } = $props();

	const total = $derived(slices.reduce((s, x) => s + x.value, 0));
	const R = 60;
	const C = 2 * Math.PI * R;

	const arcs = $derived.by(() => {
		let offset = 0;
		return slices
			.filter((s) => s.value > 0)
			.map((s) => {
				const frac = total > 0 ? s.value / total : 0;
				const arc = { ...s, frac, dash: frac * C, offset: -offset * C };
				offset += frac;
				return arc;
			});
	});
</script>

<div class="donut" style={`--size:${size}px`}>
	<svg viewBox="0 0 160 160">
		<circle cx="80" cy="80" r={R} fill="none" stroke="var(--surface-2)" stroke-width="18" />
		{#each arcs as a (a.label)}
			<circle
				cx="80"
				cy="80"
				r={R}
				fill="none"
				stroke={a.color}
				stroke-width="18"
				stroke-dasharray={`${a.dash} ${C - a.dash}`}
				stroke-dashoffset={a.offset}
				transform="rotate(-90 80 80)"
				stroke-linecap="butt"
			/>
		{/each}
	</svg>
	<div class="center">
		<span class="faint" style="font-size:11px">Total</span>
		<strong>{money(total)}</strong>
	</div>
</div>

<style>
	.donut {
		position: relative;
		width: var(--size);
		height: var(--size);
		flex: none;
	}
	svg {
		width: 100%;
		height: 100%;
	}
	.center {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.center strong {
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}
</style>
