<script lang="ts">
	import { untrack } from 'svelte';
	import {
		ACCOUNT_TYPES,
		COMMON_CAPS,
		COMPOUNDINGS,
		type Account,
		type AccountType,
		type Compounding,
		type Contribution
	} from '$lib/types';
	import { store, PALETTE } from '$lib/store.svelte';
	import { monthYear } from '$lib/format';
	import RatesEditor from './RatesEditor.svelte';
	import ContributionsEditor from './ContributionsEditor.svelte';

	let { account = null, ondone }: { account?: Account | null; ondone: () => void } = $props();

	// Amorce unique du formulaire à partir du compte édité (le composant est
	// remonté à chaque ouverture de la modale).
	const a0 = untrack(() => account);
	const editing = !!a0;

	let name = $state(a0?.name ?? '');
	let type = $state<AccountType>(a0?.type ?? 'livret');
	let balance = $state<number>(a0?.balance ?? 0);
	let contributions = $state<Contribution[]>(
		a0?.contributions ? a0.contributions.map((c) => ({ ...c })) : []
	);
	let hasYield = $state<boolean>(a0?.hasYield ?? true);
	let compounding = $state<Compounding>(a0?.compounding ?? 'annual');
	let defaultRate = $state<number>(a0?.defaultRate ?? 3);
	let extrapolateRates = $state<boolean>(a0?.extrapolateRates ?? true);
	let ratesByYear = $state<Record<number, number>>({ ...(a0?.ratesByYear ?? {}) });
	let color = $state<string>(a0?.color ?? store.nextColor());
	let hasCap = $state<boolean>(!!a0?.cap);
	let cap = $state<number>(a0?.cap ?? untrack(() => COMMON_CAPS[type]) ?? 22950);
	let overflowAccountId = $state<string>(a0?.overflowAccountId ?? '');
	let taxable = $state<boolean>(a0?.taxable ?? false);
	let taxRatePct = $state<number>(a0?.taxRatePct ?? 30);

	// Quand on change de type, on aligne l'option "produit des intérêts" et
	// pré-remplit le plafond usuel s'il y en a un.
	function onTypeChange(t: AccountType) {
		type = t;
		const def = ACCOUNT_TYPES.find((x) => x.value === t);
		if (def) hasYield = def.hasYield;
		if (COMMON_CAPS[t]) cap = COMMON_CAPS[t];
	}

	const otherAccounts = $derived(store.accounts.filter((a) => a.id !== a0?.id));
	const valid = $derived(name.trim().length > 0);

	function todayIsoMonth(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
	}

	function submit() {
		if (!valid) return;
		const balanceNum = Number(balance) || 0;
		// On ne redate le solde que s'il a réellement changé : modifier un taux ou
		// un versement ne doit pas faire croire que le solde vient d'être vérifié.
		const balanceDate =
			editing && a0 && balanceNum === a0.balance ? a0.balanceDate : todayIsoMonth();
		const payload = {
			name: name.trim(),
			type,
			balance: balanceNum,
			balanceDate,
			contributions: contributions.map((c) => ({ ...c, amount: Number(c.amount) || 0 })),
			hasYield,
			compounding,
			defaultRate: hasYield ? Number(defaultRate) || 0 : 0,
			extrapolateRates,
			ratesByYear: hasYield ? ratesByYear : {},
			cap: hasCap ? Number(cap) || undefined : undefined,
			overflowAccountId: hasCap && overflowAccountId ? overflowAccountId : undefined,
			taxable: hasYield ? taxable : false,
			taxRatePct: Number(taxRatePct) || 30,
			color
		};
		if (editing && account) store.updateAccount(account.id, payload);
		else store.addAccount(payload);
		ondone();
	}
</script>

<form
	class="stack"
	onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}
>
	<div class="field">
		<label for="acc-name">Nom du compte</label>
		<input id="acc-name" class="input" bind:value={name} placeholder="Ex. Livret A" />
	</div>

	<div class="two">
		<div class="field">
			<label for="acc-type">Type</label>
			<select
				id="acc-type"
				class="select"
				value={type}
				onchange={(e) => onTypeChange((e.target as HTMLSelectElement).value as AccountType)}
			>
				{#each ACCOUNT_TYPES as t}
					<option value={t.value}>{t.icon} {t.label}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="acc-balance">Solde actuel</label>
			<div class="input-affix">
				<input id="acc-balance" type="number" step="any" bind:value={balance} />
				<span class="affix">{store.settings.currency}</span>
			</div>
			{#if editing && a0}
				<span class="hint">
					Daté du {monthYear(new Date(a0.balanceDate))}
					{Number(balance) !== a0.balance ? '— sera mis à jour à aujourd\'hui' : ''}
				</span>
			{/if}
		</div>
	</div>

	<div class="field">
		<span class="label-as-span">Versements programmés</span>
		<ContributionsEditor bind:contributions />
	</div>

	<div class="field">
		<span class="label-as-span">Couleur</span>
		<div class="swatches">
			{#each PALETTE as c}
				<button
					type="button"
					class="swatch"
					class:sel={color === c}
					style={`background:${c}`}
					onclick={() => (color = c)}
					aria-label={`Couleur ${c}`}
				></button>
			{/each}
		</div>
	</div>

	<label class="toggle">
		<input type="checkbox" bind:checked={hasYield} />
		<span>Ce compte produit des intérêts</span>
	</label>

	{#if hasYield}
		<div class="rates-box">
			<div class="field" style="margin-bottom:16px">
				<label for="acc-compound">Capitalisation des intérêts</label>
				<select id="acc-compound" class="select" bind:value={compounding}>
					{#each COMPOUNDINGS as c}
						<option value={c.value}>{c.label}</option>
					{/each}
				</select>
				<span class="hint">{COMPOUNDINGS.find((c) => c.value === compounding)?.hint}</span>
			</div>

			<div class="section-title" style="margin-bottom:10px">Taux d'intérêt annuels (%)</div>
			<RatesEditor bind:ratesByYear bind:defaultRate bind:extrapolateRates />
		</div>

		<label class="toggle">
			<input type="checkbox" bind:checked={taxable} />
			<span>Intérêts soumis à la fiscalité (ex. PFU)</span>
		</label>
		{#if taxable}
			<div class="field" style="max-width:180px">
				<label for="acc-taxrate">Taux d'imposition</label>
				<div class="input-affix">
					<input id="acc-taxrate" type="number" step="1" bind:value={taxRatePct} />
					<span class="affix">%</span>
				</div>
				<span class="hint">30 % = prélèvement forfaitaire unique (PFU) français.</span>
			</div>
		{/if}
	{/if}

	<label class="toggle">
		<input type="checkbox" bind:checked={hasCap} />
		<span>Ce compte a un plafond réglementaire</span>
	</label>
	{#if hasCap}
		<div class="two">
			<div class="field">
				<label for="acc-cap">Plafond</label>
				<div class="input-affix">
					<input id="acc-cap" type="number" step="any" bind:value={cap} />
					<span class="affix">{store.settings.currency}</span>
				</div>
			</div>
			<div class="field">
				<label for="acc-overflow">Compte de débordement</label>
				<select id="acc-overflow" class="select" bind:value={overflowAccountId}>
					<option value="">Aucun (plafond indicatif)</option>
					{#each otherAccounts as a (a.id)}
						<option value={a.id}>{a.name}</option>
					{/each}
				</select>
				<span class="hint">L'excédent au-delà du plafond y sera automatiquement viré.</span>
			</div>
		</div>
	{/if}

	<div class="actions">
		<button type="button" class="btn btn-ghost" onclick={ondone}>Annuler</button>
		<button type="submit" class="btn btn-primary" disabled={!valid}>
			{editing ? 'Enregistrer' : 'Créer le compte'}
		</button>
	</div>
</form>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
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
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.swatch {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		border: 2px solid transparent;
		outline: 2px solid transparent;
		transition: transform 0.1s;
	}
	.swatch.sel {
		outline-color: var(--text);
		outline-offset: 2px;
	}
	.swatch:hover {
		transform: scale(1.1);
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
	.rates-box {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		background: var(--surface-2);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 4px;
	}
	@media (max-width: 520px) {
		.two {
			grid-template-columns: 1fr;
		}
	}
</style>
