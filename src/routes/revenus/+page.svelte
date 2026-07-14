<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { money, percent } from '$lib/format';
	import {
		monthlyIncomeAt,
		monthlyExpensesAt,
		monthlyInvestableAt,
		incomeAllocationWeights,
		monthlyBudgetAt,
		totalExpenses,
		type SimPoint
	} from '$lib/finance';
	import { ACCOUNT_TYPES, MONTHS } from '$lib/types';
	import LineChart from '$lib/components/LineChart.svelte';

	function uid() {
		return crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
	}

	const plan = $derived(store.incomePlan);
	const horizon = $derived(store.settings.defaultHorizonYears);
	const months = $derived(horizon * 12);
	const thisYear = new Date().getFullYear();

	// Points mensuels : revenu net, besoins vitaux, capacité d'épargne.
	const series = $derived.by(() => {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const income: SimPoint[] = [];
		const expenses: SimPoint[] = [];
		const invest: SimPoint[] = [];
		let cumul = 0;
		for (let m = 0; m <= months; m++) {
			const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
			const i = monthlyIncomeAt(plan, m, d);
			const e = monthlyExpensesAt(plan, m);
			const v = monthlyInvestableAt(plan, m, d);
			if (m > 0) cumul += v;
			income.push({ monthIndex: m, date: d, balance: i, principal: i, interest: 0 });
			expenses.push({ monthIndex: m, date: d, balance: e, principal: e, interest: 0 });
			invest.push({ monthIndex: m, date: d, balance: v, principal: v, interest: 0 });
		}
		return { income, expenses, invest, cumul };
	});

	const expensesTotal = $derived(totalExpenses(plan));
	const currentSurplus = $derived(Math.max(0, plan.netMonthlyIncome - expensesTotal));
	const investNow = $derived(store.incomeMonthlySavings);
	const investEnd = $derived(series.invest[series.invest.length - 1]?.balance ?? 0);

	// Budget du mois courant : reste à vivre = revenu − besoins − épargne totale.
	const budget = $derived(monthlyBudgetAt(plan, store.accounts, 0, new Date()));

	// Allocation normalisée pour l'affichage.
	const weights = $derived(incomeAllocationWeights(plan, store.accounts));

	function typeInfo(v: string) {
		return ACCOUNT_TYPES.find((t) => t.value === v);
	}
	function setWeight(id: string, v: number) {
		plan.allocation = { ...plan.allocation, [id]: v };
	}
	function addRaise() {
		plan.raises = [...plan.raises, { id: uid(), year: thisYear + 1, amount: 200 }];
	}
	function removeRaise(id: string) {
		plan.raises = plan.raises.filter((r) => r.id !== id);
	}
	function updateRaise(id: string, patch: Partial<{ year: number; amount: number }>) {
		plan.raises = plan.raises.map((r) => (r.id === id ? { ...r, ...patch } : r));
	}

	function addExpense() {
		plan.expenses = [...plan.expenses, { id: uid(), label: '', amount: 0 }];
	}
	function removeExpense(id: string) {
		plan.expenses = plan.expenses.filter((e) => e.id !== id);
	}
	function updateExpense(id: string, patch: Partial<{ label: string; amount: number }>) {
		plan.expenses = plan.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e));
	}

	function addLifeEvent() {
		store.addLifeEvent({
			label: '',
			year: thisYear + 1,
			month: 1,
			amount: -1000,
			accountId: store.accounts[0]?.id ?? ''
		});
	}
</script>

<div class="spread page-head">
	<div>
		<h1>Revenus</h1>
		<p class="muted">Modélisez votre salaire et sa progression pour piloter votre épargne.</p>
	</div>
	{#if plan.enabled}
		<label class="switch">
			<input type="checkbox" bind:checked={plan.enabled} />
			<span>Plan activé</span>
		</label>
	{/if}
</div>

{#if !plan.enabled}
	<div class="empty">
		<span class="emoji">💰</span>
		<h2 style="margin-bottom:8px">Pilotez votre épargne par vos revenus</h2>
		<p style="max-width:520px;margin:0 auto 18px">
			Renseignez votre salaire, son évolution et vos besoins vitaux. e-conomy en déduit votre
			capacité d'épargne — et surtout, la part de vos futures augmentations que vous investissez.
			Cette épargne alimente automatiquement vos comptes dans les simulations.
		</p>
		<div class="row" style="justify-content:center">
			<button class="btn btn-primary" onclick={() => (plan.enabled = true)}>Activer le plan de revenus</button>
			{#if store.accounts.length === 0}
				<button class="btn" onclick={() => store.loadDemo()}>Charger un exemple</button>
			{/if}
		</div>
	</div>
{:else}
	<!-- Résumé -->
	<div class="stats grid">
		<div class="card card-pad stat">
			<span class="section-title">Surplus mensuel actuel</span>
			<span class="stat-value">{money(currentSurplus)}</span>
			<span class="faint">revenu − besoins vitaux</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Capacité d'épargne</span>
			<span class="stat-value pos">{money(investNow)}</span>
			<span class="faint">investis chaque mois aujourd'hui</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Dans {horizon} ans</span>
			<span class="stat-value pos">{money(investEnd)}</span>
			<span class="faint">par mois, grâce aux augmentations</span>
		</div>
		<div class="card card-pad stat">
			<span class="section-title">Cumul investi ({horizon} ans)</span>
			<span class="stat-value">{money(series.cumul)}</span>
			<span class="faint">versé via vos revenus</span>
		</div>
	</div>

	<!-- Reste à vivre + garde-fou budgétaire -->
	<div class="card card-pad budget-card" class:over={budget.remaining < 0} style="margin-top:16px">
		<div class="budget-top">
			<div>
				<span class="section-title">Reste à vivre</span>
				<div class="budget-value {budget.remaining < 0 ? 'neg' : 'pos'}">{money(budget.remaining)}</div>
			</div>
			<div class="budget-breakdown">
				<span>Revenu <strong class="tnum">{money(budget.income)}</strong></span>
				<span>− Besoins <strong class="tnum">{money(budget.expenses)}</strong></span>
				<span>− Versements fixes <strong class="tnum">{money(budget.fixedContributions)}</strong></span>
				<span>− Épargne du plan <strong class="tnum">{money(budget.planSavings)}</strong></span>
			</div>
		</div>
		{#if budget.remaining < 0}
			<p class="budget-warn">
				⚠️ Tu programmes {money(budget.totalSavings)} d'épargne alors que ton budget ne dégage
				que {money(budget.income - budget.expenses)} : il manque {money(-budget.remaining)} par mois.
			</p>
		{/if}
		<label class="toggle" style="margin-top:12px">
			<input type="checkbox" bind:checked={plan.capSavingsToSurplus} />
			<span>Plafonner automatiquement l'épargne au surplus disponible</span>
		</label>
	</div>

	<!-- Graphique -->
	<div class="card card-pad" style="margin-top:16px">
		<h3 style="margin-bottom:14px">Revenu, besoins et capacité d'épargne</h3>
		<LineChart
			series={[
				{ label: 'Revenu net', color: 'var(--brand)', points: series.income },
				{ label: 'Besoins vitaux', color: 'var(--warn)', points: series.expenses },
				{ label: "Capacité d'épargne", color: 'var(--pos)', points: series.invest, area: true }
			]}
			height={260}
		/>
		<div class="legend">
			<span><span class="dot" style="background:var(--brand)"></span> Revenu net mensuel</span>
			<span><span class="dot" style="background:var(--warn)"></span> Besoins vitaux</span>
			<span><span class="dot" style="background:var(--pos)"></span> Capacité d'épargne</span>
		</div>
	</div>

	<div class="forms">
		<!-- Revenus -->
		<div class="card card-pad">
			<h3 style="margin-bottom:14px">💼 Revenus</h3>
			<div class="two">
				<div class="field">
					<label for="inc">Salaire net mensuel</label>
					<div class="input-affix">
						<input id="inc" type="number" step="any" bind:value={plan.netMonthlyIncome} />
						<span class="affix">{store.settings.currency}</span>
					</div>
				</div>
				<div class="field">
					<label for="inc-gross">Salaire brut mensuel</label>
					<div class="input-affix">
						<input id="inc-gross" type="number" step="any" bind:value={plan.grossMonthlyIncome} />
						<span class="affix">{store.settings.currency}</span>
					</div>
					<span class="hint">Sert de référence aux règles de virement plafonnées en % du brut (ex. PEE).</span>
				</div>
				<div class="field">
					<label for="raise">Évolution annuelle</label>
					<div class="input-affix">
						<input id="raise" type="number" step="0.1" bind:value={plan.annualRaisePct} />
						<span class="affix">% / an</span>
					</div>
					<span class="hint">Augmentation moyenne (ancienneté, inflation salariale).</span>
				</div>
			</div>

			<div class="field" style="margin-top:14px">
				<span class="label-as-span">Augmentations exceptionnelles</span>
				<span class="hint">Montant mensuel supplémentaire à partir d'une année (promotion, changement de poste…).</span>
				<div class="raises">
					{#each plan.raises as r (r.id)}
						<div class="raise-row">
							<div class="input-affix">
								<span class="affix">＋</span>
								<input
									type="number"
									step="any"
									value={r.amount}
									oninput={(e) => updateRaise(r.id, { amount: parseFloat((e.target as HTMLInputElement).value) || 0 })}
									aria-label="Montant"
								/>
								<span class="affix">{store.settings.currency}/mois</span>
							</div>
							<span class="in">dès</span>
							<input
								class="input year"
								type="number"
								value={r.year}
								oninput={(e) => updateRaise(r.id, { year: parseInt((e.target as HTMLInputElement).value) || thisYear })}
								aria-label="Année"
							/>
							<button class="btn btn-icon btn-ghost" onclick={() => removeRaise(r.id)} aria-label="Retirer">✕</button>
						</div>
					{/each}
				</div>
				<button type="button" class="btn btn-sm" onclick={addRaise} style="align-self:flex-start;margin-top:8px">
					＋ Ajouter une augmentation
				</button>
			</div>
		</div>

		<!-- Besoins -->
		<div class="card card-pad">
			<div class="spread" style="margin-bottom:6px">
				<h3>🏠 Besoins vitaux</h3>
				<span class="badge">Total {money(expensesTotal)} / mois</span>
			</div>
			<p class="muted" style="font-size:13px;margin:0 0 14px">
				Détaillez vos dépenses incompressibles poste par poste.
			</p>

			<div class="expenses">
				{#each plan.expenses as e (e.id)}
					<div class="expense-row">
						<input
							class="input exp-label"
							type="text"
							placeholder="Poste (ex. Loyer)"
							value={e.label}
							oninput={(ev) => updateExpense(e.id, { label: (ev.target as HTMLInputElement).value })}
							aria-label="Libellé du poste"
						/>
						<div class="input-affix exp-amount">
							<input
								type="number"
								step="any"
								value={e.amount}
								oninput={(ev) => updateExpense(e.id, { amount: parseFloat((ev.target as HTMLInputElement).value) || 0 })}
								aria-label="Montant"
							/>
							<span class="affix">{store.settings.currency}</span>
						</div>
						<button class="btn btn-icon btn-ghost" onclick={() => removeExpense(e.id)} aria-label="Retirer le poste">✕</button>
					</div>
				{/each}
			</div>

			<button type="button" class="btn btn-sm" onclick={addExpense} style="align-self:flex-start;margin-top:10px">
				＋ Ajouter un poste
			</button>

			<div class="field" style="margin-top:16px;max-width:220px">
				<label for="infl">Inflation des besoins</label>
				<div class="input-affix">
					<input id="infl" type="number" step="0.1" bind:value={plan.expenseInflationPct} />
					<span class="affix">% / an</span>
				</div>
			</div>
		</div>

		<!-- Stratégie -->
		<div class="card card-pad">
			<h3 style="margin-bottom:6px">🎯 Stratégie d'épargne</h3>
			<p class="muted" style="font-size:13px;margin:0 0 16px">
				Vos besoins étant couverts, vous pouvez investir une grande partie de vos augmentations.
			</p>

			<div class="slider-field">
				<div class="spread">
					<label for="base">Part du surplus actuel épargnée</label>
					<strong class="tnum">{percent(plan.baseSavingsRate, 0)}</strong>
				</div>
				<input id="base" type="range" min="0" max="100" step="5" bind:value={plan.baseSavingsRate} />
				<span class="hint">Soit {money((currentSurplus * plan.baseSavingsRate) / 100)} / mois sur {money(currentSurplus)} de surplus.</span>
			</div>

			<div class="slider-field" style="margin-top:16px">
				<div class="spread">
					<label for="raise-rate">Part des augmentations investie</label>
					<strong class="tnum pos">{percent(plan.raiseSavingsRate, 0)}</strong>
				</div>
				<input id="raise-rate" type="range" min="0" max="100" step="5" bind:value={plan.raiseSavingsRate} />
				<span class="hint">Appliquée à chaque euro gagné en plus (au-delà de vos besoins).</span>
			</div>
		</div>

		<!-- Répartition -->
		<div class="card card-pad">
			<h3 style="margin-bottom:6px">📊 Répartition vers les comptes</h3>
			<p class="muted" style="font-size:13px;margin:0 0 14px">
				Poids relatifs. Sans réglage, l'épargne est répartie équitablement.
			</p>
			{#if store.accounts.length === 0}
				<p class="hint" style="margin:0">Aucun compte. <a href="/comptes" class="link">Créez un compte</a>.</p>
			{:else}
				<div class="alloc">
					{#each store.accounts as a (a.id)}
						{@const frac = weights.get(a.id) ?? 0}
						<div class="alloc-row">
							<span class="alloc-name">
								<span class="dot" style={`background:${a.color}`}></span>
								{typeInfo(a.type)?.icon}
								{a.name}
							</span>
							<input
								class="input weight"
								type="number"
								min="0"
								step="1"
								value={plan.allocation[a.id] ?? 0}
								oninput={(e) => setWeight(a.id, parseFloat((e.target as HTMLInputElement).value) || 0)}
								aria-label={`Poids ${a.name}`}
							/>
							<span class="alloc-pct faint tnum">{percent(frac * 100, 0)}</span>
							<span class="alloc-eur tnum">{money(investNow * frac)}/mois</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="row disable">
		<label class="switch">
			<input type="checkbox" bind:checked={plan.enabled} />
			<span>Plan de revenus activé</span>
		</label>
	</div>
{/if}

<!-- Événements de vie : disponibles même sans plan de revenus, ils affectent -->
<!-- directement le compte concerné dans les simulations. -->
<div class="card card-pad" style="margin-top:16px">
	<h3 style="margin-bottom:6px">🎉 Événements de vie</h3>
	<p class="muted" style="font-size:13px;margin:0 0 14px">
		Dépenses ou rentrées ponctuelles connues à l'avance (achat, travaux, prime, héritage…),
		appliquées sur un compte à une date donnée.
	</p>
	{#if store.accounts.length === 0}
		<p class="hint" style="margin:0">Aucun compte. <a href="/comptes" class="link">Créez un compte</a>.</p>
	{:else}
		<div class="events">
			{#each store.lifeEvents as ev (ev.id)}
				<div class="event-row">
					<input
						class="input ev-label"
						type="text"
						placeholder="Libellé (ex. Achat voiture)"
						value={ev.label}
						oninput={(e) => store.updateLifeEvent(ev.id, { label: (e.target as HTMLInputElement).value })}
						aria-label="Libellé"
					/>
					<div class="input-affix ev-amount">
						<span class="affix">{ev.amount >= 0 ? '＋' : '−'}</span>
						<input
							type="number"
							step="any"
							value={Math.abs(ev.amount)}
							oninput={(e) => {
								const v = parseFloat((e.target as HTMLInputElement).value) || 0;
								store.updateLifeEvent(ev.id, { amount: ev.amount < 0 ? -v : v });
							}}
							aria-label="Montant"
						/>
					</div>
					<button
						type="button"
						class="btn btn-sm sign-btn"
						onclick={() => store.updateLifeEvent(ev.id, { amount: -ev.amount })}
						title="Basculer dépense / rentrée"
					>
						{ev.amount >= 0 ? 'Rentrée' : 'Dépense'}
					</button>
					<select
						class="select ev-month"
						value={ev.month}
						onchange={(e) => store.updateLifeEvent(ev.id, { month: Number((e.target as HTMLSelectElement).value) })}
					>
						{#each MONTHS as m, i}
							<option value={i + 1}>{m}</option>
						{/each}
					</select>
					<input
						class="input ev-year"
						type="number"
						value={ev.year}
						oninput={(e) => store.updateLifeEvent(ev.id, { year: parseInt((e.target as HTMLInputElement).value) || thisYear })}
						aria-label="Année"
					/>
					<select
						class="select ev-account"
						value={ev.accountId}
						onchange={(e) => store.updateLifeEvent(ev.id, { accountId: (e.target as HTMLSelectElement).value })}
					>
						{#each store.accounts as a (a.id)}
							<option value={a.id}>{a.name}</option>
						{/each}
					</select>
					<button class="btn btn-icon btn-ghost" onclick={() => store.removeLifeEvent(ev.id)} aria-label="Retirer l'événement">✕</button>
				</div>
			{/each}
		</div>
		<button type="button" class="btn btn-sm" onclick={addLifeEvent} style="margin-top:10px">
			＋ Ajouter un événement
		</button>
	{/if}
</div>

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
	.budget-card.over {
		border-color: color-mix(in srgb, var(--neg) 40%, var(--border));
	}
	.budget-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}
	.budget-value {
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin-top: 2px;
	}
	.budget-breakdown {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.budget-breakdown strong {
		color: var(--text);
		margin-left: 4px;
	}
	.budget-warn {
		margin: 12px 0 0;
		font-size: 13px;
		padding: 9px 11px;
		border-radius: 9px;
		background: color-mix(in srgb, var(--neg) 12%, transparent);
		color: color-mix(in srgb, var(--neg) 80%, var(--text));
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.toggle input {
		width: 18px;
		height: 18px;
		accent-color: var(--brand);
	}
	.link {
		font-weight: 600;
	}
	.link:hover {
		color: var(--brand);
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
	.forms {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-top: 16px;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.label-as-span {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	.raises {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
	}
	.raise-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.in {
		color: var(--text-muted);
		font-size: 13px;
	}
	.year {
		width: 90px;
	}
	.expenses {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.expense-row {
		display: grid;
		grid-template-columns: 1fr 130px 36px;
		align-items: center;
		gap: 8px;
	}
	.exp-amount {
		width: 130px;
	}
	.slider-field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.slider-field label {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--brand);
		cursor: pointer;
	}
	.alloc {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.alloc-row {
		display: grid;
		grid-template-columns: 1fr 72px 44px auto;
		align-items: center;
		gap: 10px;
	}
	.alloc-name {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.weight {
		text-align: center;
		padding: 8px;
	}
	.alloc-pct {
		text-align: right;
	}
	.alloc-eur {
		font-size: 13px;
		font-weight: 600;
		text-align: right;
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.switch input {
		width: 40px;
		height: 22px;
		accent-color: var(--brand);
	}
	.disable {
		margin-top: 20px;
		justify-content: center;
	}
	.events {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.event-row {
		display: grid;
		grid-template-columns: 1.4fr 110px auto 110px 80px 1fr 36px;
		align-items: center;
		gap: 8px;
	}
	.ev-amount {
		width: 110px;
	}
	.sign-btn {
		white-space: nowrap;
		font-size: 12px;
	}
	@media (max-width: 900px) {
		.event-row {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
		.forms {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 520px) {
		.two {
			grid-template-columns: 1fr;
		}
		.alloc-row {
			grid-template-columns: 1fr 60px 40px;
		}
		.alloc-eur {
			display: none;
		}
	}
</style>
