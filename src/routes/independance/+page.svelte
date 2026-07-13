<script lang="ts">
	// Indépendance financière : à partir de quel capital la rente mensuelle
	// (au taux de retrait choisi) couvre les besoins vitaux ? Et quelle répartition
	// croissance / sécurisé est indicative à cet horizon (glide path classique).
	import { store } from '$lib/store.svelte';
	import { money, percent, fullDate, durationFromNow } from '$lib/format';
	import {
		simulatePortfolio,
		computeProjectWithdrawals,
		capitalNeededForRente,
		renteFromCapital,
		currentAllocationSplit,
		recommendedAllocation,
		totalExpenses,
		type SimPoint
	} from '$lib/finance';
	import DonutChart from '$lib/components/DonutChart.svelte';
	import LineChart from '$lib/components/LineChart.svelte';

	const HORIZON_YEARS = 40; // large, pour avoir de bonnes chances de capter l'échéance
	const months = HORIZON_YEARS * 12;

	const withdrawalRate = $derived(store.settings.withdrawalRatePct);
	const monthlyExpenses = $derived(totalExpenses(store.incomePlan));
	const capitalNeeded = $derived(capitalNeededForRente(monthlyExpenses, withdrawalRate));

	const simOpts = $derived({
		plan: store.incomePlan,
		lifeEvents: store.lifeEvents,
		transferRules: store.transferRules
	});
	// Cohérent avec le dashboard : les projets actifs sont modélisés comme dépensés
	// à leur échéance, pour ne pas surestimer le capital réellement disponible.
	const projectWithdrawals = $derived(
		computeProjectWithdrawals(store.projects, store.accounts, months, simOpts)
	);
	const sim = $derived(
		simulatePortfolio(store.accounts, months, {
			...simOpts,
			lifeEvents: [...store.lifeEvents, ...projectWithdrawals]
		})
	);

	const currentWealth = $derived(sim.total[0]?.balance ?? 0);
	const fiPoint = $derived(sim.total.find((p) => p.balance >= capitalNeeded));
	const alreadyThere = $derived(capitalNeeded > 0 && currentWealth >= capitalNeeded);
	const progress = $derived(capitalNeeded > 0 ? currentWealth / capitalNeeded : 0);
	const currentRente = $derived(renteFromCapital(currentWealth, withdrawalRate));

	const yearsToFI = $derived(fiPoint ? fiPoint.monthIndex / 12 : HORIZON_YEARS);
	const recommended = $derived(recommendedAllocation(yearsToFI));
	const current = $derived(currentAllocationSplit(store.accounts));
	const currentTotal = $derived(current.growth + current.safe);
	const currentGrowthPct = $derived(currentTotal > 0 ? (current.growth / currentTotal) * 100 : 0);

	const currentSlices = $derived([
		{ label: 'Croissance (PEA, CTO, PEE, PER)', value: current.growth, color: 'var(--brand)' },
		{ label: 'Sécurisé (Livret, courant, AV…)', value: current.safe, color: 'var(--pos)' }
	]);
	const recommendedSlices = $derived([
		{ label: 'Croissance', value: (currentTotal * recommended.growthPct) / 100, color: 'var(--brand)' },
		{ label: 'Sécurisé', value: (currentTotal * recommended.safePct) / 100, color: 'var(--pos)' }
	]);

	const thresholdSeries = $derived.by((): SimPoint[] =>
		sim.total.map((p) => ({ ...p, balance: capitalNeeded, principal: capitalNeeded, interest: 0 }))
	);
</script>

<div class="page-head">
	<h1>Indépendance financière</h1>
	<p class="muted">À partir de quel capital pouvez-vous vous verser une rente qui couvre vos frais fixes ?</p>
</div>

{#if store.accounts.length === 0}
	<div class="empty">
		<span class="emoji">🏖️</span>
		<h2 style="margin-bottom:8px">Aucun compte pour l'instant</h2>
		<p style="margin:0 0 18px">Ajoutez vos comptes pour estimer votre capital disponible.</p>
		<a href="/comptes" class="btn btn-primary">Ajouter un compte</a>
	</div>
{:else if monthlyExpenses <= 0}
	<div class="empty">
		<span class="emoji">🧾</span>
		<h2 style="margin-bottom:8px">Renseignez vos besoins vitaux</h2>
		<p style="margin:0 0 18px;max-width:460px;margin-inline:auto">
			Le capital nécessaire à l'indépendance financière se calcule à partir de vos dépenses
			incompressibles. Détaillez-les sur la page Revenus pour débloquer cette vue.
		</p>
		<a href="/revenus" class="btn btn-primary">Renseigner mes besoins</a>
	</div>
{:else}
	<!-- Résumé -->
	<div class="stats grid">
		<div class="card card-pad stat">
			<span class="section-title">Besoins vitaux</span>
			<span class="stat-value">{money(monthlyExpenses)}</span>
			<span class="faint">par mois à couvrir</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Capital nécessaire</span>
			<span class="stat-value">{money(capitalNeeded)}</span>
			<span class="faint">au taux de retrait de {percent(withdrawalRate, 1)}/an</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Capital actuel</span>
			<span class="stat-value">{money(currentWealth)}</span>
			<span class="faint">soit {money(currentRente)}/mois de rente possible</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Échéance estimée</span>
			<span class="stat-value {alreadyThere ? 'pos' : ''}" style="font-size:20px">
				{#if alreadyThere}
					Atteinte ✓
				{:else if fiPoint}
					{fullDate(fiPoint.date)}
				{:else}
					<span class="faint">> {HORIZON_YEARS} ans</span>
				{/if}
			</span>
			{#if fiPoint && !alreadyThere}
				<span class="faint">dans {durationFromNow(fiPoint.date)}</span>
			{/if}
		</div>
	</div>

	<!-- Progression -->
	<div class="card card-pad" style="margin-top:16px">
		<div class="spread" style="margin-bottom:8px">
			<h3>Progression vers l'indépendance</h3>
			<span class="tnum" style="font-weight:700">{percent(Math.min(100, progress * 100), 0)}</span>
		</div>
		<div class="progress" style="height:14px">
			<div style={`width:${Math.min(100, progress * 100)}%;background:var(--brand)`}></div>
		</div>
		{#if alreadyThere}
			<p class="pos" style="margin:10px 0 0;font-size:14px">
				🎉 Votre capital actuel couvre déjà une rente supérieure à vos besoins vitaux.
			</p>
		{/if}
	</div>

	<!-- Graphique -->
	<div class="card card-pad" style="margin-top:16px">
		<h3 style="margin-bottom:14px">Patrimoine projeté vs capital nécessaire</h3>
		<LineChart
			series={[
				{ label: 'Patrimoine projeté', color: 'var(--brand)', points: sim.total, area: true },
				{ label: 'Capital nécessaire', color: 'var(--warn)', points: thresholdSeries }
			]}
			height={280}
		/>
		<div class="legend">
			<span><span class="dot" style="background:var(--brand)"></span> Patrimoine projeté</span>
			<span><span class="dot" style="background:var(--warn)"></span> Capital nécessaire ({money(capitalNeeded)})</span>
		</div>
	</div>

	<!-- Allocation -->
	<div class="card card-pad" style="margin-top:16px">
		<h3 style="margin-bottom:6px">Répartition croissance / sécurisé</h3>
		<p class="muted" style="font-size:13px;margin:0 0 16px">
			Repère indicatif (pas un conseil personnalisé) : plus l'échéance est lointaine, plus on peut
			viser la croissance ; plus elle approche, plus on sécurise le capital déjà constitué.
		</p>
		<div class="alloc-compare">
			<div class="alloc-col">
				<DonutChart slices={currentSlices} size={150} />
				<div class="alloc-label">
					<strong>Actuel</strong>
					<span class="faint">{percent(currentGrowthPct, 0)} croissance</span>
				</div>
			</div>
			<div class="alloc-arrow">→</div>
			<div class="alloc-col">
				<DonutChart slices={recommendedSlices} size={150} />
				<div class="alloc-label">
					<strong>Cible indicative</strong>
					<span class="faint">{percent(recommended.growthPct, 0)} croissance</span>
					<span class="faint" style="display:block">à {yearsToFI < HORIZON_YEARS ? Math.round(yearsToFI) : '40+'} ans de l'échéance</span>
				</div>
			</div>
		</div>
		<div class="alloc-legend">
			<span><span class="dot" style="background:var(--brand)"></span> Croissance (PEA, CTO, PEE, PER)</span>
			<span><span class="dot" style="background:var(--pos)"></span> Sécurisé (Livret, courant, assurance-vie…)</span>
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
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.legend,
	.alloc-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		margin-top: 12px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.legend span,
	.alloc-legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.alloc-compare {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 24px;
		flex-wrap: wrap;
	}
	.alloc-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}
	.alloc-label {
		text-align: center;
		font-size: 13px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.alloc-arrow {
		font-size: 22px;
		color: var(--text-faint);
	}
	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
