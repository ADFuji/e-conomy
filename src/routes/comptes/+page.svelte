<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { money, percent, contributionLabel, monthYear } from '$lib/format';
	import { ACCOUNT_TYPES, COMPOUNDINGS, type Account } from '$lib/types';
	import { rateForYear, catchUpAccount } from '$lib/finance';
	import Modal from '$lib/components/Modal.svelte';
	import AccountForm from '$lib/components/AccountForm.svelte';

	let showForm = $state(false);
	let editing = $state<Account | null>(null);
	let confirmDelete = $state<Account | null>(null);

	const thisYear = new Date().getFullYear();
	const now = new Date();
	const currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

	function typeInfo(v: string) {
		return ACCOUNT_TYPES.find((t) => t.value === v);
	}

	/** Solde estimé à aujourd'hui si le solde saisi date d'un mois antérieur. */
	function estimatedToday(a: Account): number | null {
		if (a.balanceDate >= currentMonthIso) return null;
		return catchUpAccount(a, now, store.lifeEvents).balance;
	}

	function openNew() {
		editing = null;
		showForm = true;
	}
	function openEdit(a: Account) {
		editing = a;
		showForm = true;
	}
</script>

<div class="spread page-head">
	<div>
		<h1>Comptes</h1>
		<p class="muted">Vos comptes en banque, leurs soldes et leurs rendements.</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}>＋ Nouveau compte</button>
</div>

{#if store.accounts.length === 0}
	<div class="empty">
		<span class="emoji">🏦</span>
		<h2 style="margin-bottom:8px">Aucun compte</h2>
		<p style="margin:0 0 18px">Ajoutez vos comptes : compte courant, Livret A, PEE, assurance-vie…</p>
		<div class="row" style="justify-content:center">
			<button class="btn btn-primary" onclick={openNew}>Ajouter un compte</button>
			<button class="btn" onclick={() => store.loadDemo()}>Charger un exemple</button>
		</div>
	</div>
{:else}
	<div class="accounts">
		{#each store.accounts as a (a.id)}
			<div class="card card-pad account" style={`--accent:${a.color}`}>
				<div class="acc-top">
					<div class="acc-id">
						<span class="acc-icon">{typeInfo(a.type)?.icon}</span>
						<div>
							<div class="acc-name">{a.name}</div>
							<div class="faint" style="font-size:12px">{typeInfo(a.type)?.label}</div>
						</div>
					</div>
					<div class="acc-actions">
						<button class="btn btn-icon btn-ghost" onclick={() => openEdit(a)} aria-label="Modifier">✏️</button>
						<button class="btn btn-icon btn-danger" onclick={() => (confirmDelete = a)} aria-label="Supprimer">🗑️</button>
					</div>
				</div>

				<div class="acc-balance tnum">{money(a.balance)}</div>
				{#if estimatedToday(a) !== null}
					<div class="acc-stale">
						📅 Solde du {monthYear(new Date(a.balanceDate))}
						<span class="faint">· ≈ {money(estimatedToday(a))} aujourd'hui</span>
					</div>
				{/if}

				<div class="acc-meta">
					{#each a.contributions as c (c.id)}
						<span class="badge">{contributionLabel(c)}</span>
					{/each}
					{#if a.hasYield}
						<span class="badge" style="color:var(--pos)">
							{percent(rateForYear(a, thisYear))} en {thisYear}
						</span>
						<span class="badge">
							🔁 {COMPOUNDINGS.find((c) => c.value === a.compounding)?.label.toLowerCase()}
						</span>
						{#if a.taxable}
							<span class="badge" style="color:var(--warn)">🧾 fiscalisé {percent(a.taxRatePct ?? 30, 0)}</span>
						{/if}
					{:else}
						<span class="badge">Sans rendement</span>
					{/if}
					{#if a.cap}
						<span class="badge">
							🧢 plafond {money(a.cap)}
							{#if a.overflowAccountId}
								→ {store.getAccount(a.overflowAccountId)?.name}
							{/if}
						</span>
					{/if}
				</div>

				{#if a.hasYield}
					{@const years = Object.keys(a.ratesByYear).map(Number).sort((x, y) => x - y)}
					{#if years.length > 0}
						<div class="rates-strip">
							{#each years as y (y)}
								<div class="rate-cell" class:past={y < thisYear}>
									<span class="ry">{y}</span>
									<span class="rv tnum">{percent(a.ratesByYear[y])}</span>
								</div>
							{/each}
							{#if a.extrapolateRates && years.length >= 2}
								<div class="rate-cell default">
									<span class="ry">Autres</span>
									<span class="rv tnum">📈 tendance</span>
								</div>
							{:else}
								<div class="rate-cell default">
									<span class="ry">Défaut</span>
									<span class="rv tnum">{percent(a.defaultRate)}</span>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	</div>
{/if}

<Modal bind:open={showForm} title={editing ? 'Modifier le compte' : 'Nouveau compte'} width={600}>
	<AccountForm account={editing} ondone={() => (showForm = false)} />
</Modal>

<Modal bind:open={() => !!confirmDelete, (v) => { if (!v) confirmDelete = null; }} title="Supprimer le compte" width={420}>
	{#if confirmDelete}
		<p>
			Supprimer <strong>{confirmDelete.name}</strong> ? Cette action est définitive et retire le
			compte des projets qu'il finance.
		</p>
		<div class="row" style="justify-content:flex-end;margin-top:20px">
			<button class="btn btn-ghost" onclick={() => (confirmDelete = null)}>Annuler</button>
			<button
				class="btn btn-primary"
				style="background:var(--neg);border-color:var(--neg)"
				onclick={() => {
					if (confirmDelete) store.removeAccount(confirmDelete.id);
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
	.accounts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 16px;
	}
	.account {
		border-top: 3px solid var(--accent);
	}
	.acc-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.acc-id {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.acc-icon {
		font-size: 24px;
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		border-radius: 11px;
		flex: none;
	}
	.acc-name {
		font-weight: 700;
		font-size: 15px;
	}
	.acc-actions {
		display: flex;
		gap: 2px;
	}
	.acc-balance {
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 14px 0 10px;
	}
	.acc-stale {
		font-size: 12px;
		color: var(--warn);
		background: color-mix(in srgb, var(--warn) 10%, transparent);
		border-radius: 8px;
		padding: 5px 9px;
		margin: -4px 0 12px;
		display: inline-block;
	}
	.acc-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.rates-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}
	.rate-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 5px 10px;
		background: var(--surface-2);
		border-radius: 8px;
		min-width: 58px;
	}
	.rate-cell.default {
		background: transparent;
		border: 1px dashed var(--border-strong);
	}
	.rate-cell.past {
		opacity: 0.62;
	}
	.ry {
		font-size: 11px;
		color: var(--text-faint);
		font-weight: 600;
	}
	.rv {
		font-weight: 700;
		font-size: 13px;
	}
</style>
