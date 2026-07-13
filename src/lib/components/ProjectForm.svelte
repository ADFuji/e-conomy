<script lang="ts">
	import { untrack } from 'svelte';
	import { PROJECT_CATEGORIES, type Project, type ProjectCategory } from '$lib/types';
	import { store, PALETTE } from '$lib/store.svelte';

	let { project = null, ondone }: { project?: Project | null; ondone: () => void } = $props();

	// Amorce unique du formulaire (le composant est remonté à chaque ouverture).
	const p0 = untrack(() => project);
	const editing = !!p0;

	let name = $state(p0?.name ?? '');
	let category = $state<ProjectCategory>(p0?.category ?? 'urgence');
	let targetAmount = $state<number>(p0?.targetAmount ?? 0);
	let targetDate = $state<string>(p0?.targetDate?.slice(0, 10) ?? '');
	let fundingAccountIds = $state<string[]>([...(p0?.fundingAccountIds ?? [])]);
	let notes = $state<string>(p0?.notes ?? '');
	let color = $state<string>(p0?.color ?? store.nextColor());

	const valid = $derived(name.trim().length > 0 && Number(targetAmount) > 0);

	function toggleAccount(id: string) {
		fundingAccountIds = fundingAccountIds.includes(id)
			? fundingAccountIds.filter((x) => x !== id)
			: [...fundingAccountIds, id];
	}

	function submit() {
		if (!valid) return;
		const payload = {
			name: name.trim(),
			category,
			targetAmount: Number(targetAmount) || 0,
			targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
			fundingAccountIds,
			notes: notes.trim() || undefined,
			color
		};
		if (editing && project) store.updateProject(project.id, payload);
		else store.addProject(payload);
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
		<label for="pr-name">Nom du projet</label>
		<input id="pr-name" class="input" bind:value={name} placeholder="Ex. Apport achat maison" />
	</div>

	<div class="field">
		<span class="label-as-span">Catégorie</span>
		<div class="cats">
			{#each PROJECT_CATEGORIES as c}
				<button
					type="button"
					class="chip"
					class:active={category === c.value}
					onclick={() => (category = c.value)}
				>
					{c.icon} {c.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="two">
		<div class="field">
			<label for="pr-target">Montant objectif</label>
			<div class="input-affix">
				<input id="pr-target" type="number" step="any" bind:value={targetAmount} />
				<span class="affix">{store.settings.currency}</span>
			</div>
		</div>
		<div class="field">
			<label for="pr-date">Date cible (optionnelle)</label>
			<input id="pr-date" class="input" type="date" bind:value={targetDate} />
		</div>
	</div>

	<div class="field">
		<span class="label-as-span">Comptes de financement</span>
		{#if store.accounts.length === 0}
			<p class="hint">Aucun compte pour l'instant. Créez d'abord des comptes.</p>
		{:else}
			<p class="hint">Sélectionnez les comptes affectés à ce projet. Aucun sélectionné = tous les comptes.</p>
			<div class="accs">
				{#each store.accounts as a (a.id)}
					<button
						type="button"
						class="chip"
						class:active={fundingAccountIds.includes(a.id)}
						onclick={() => toggleAccount(a.id)}
					>
						<span class="dot" style={`background:${a.color}`}></span>
						{a.name}
					</button>
				{/each}
			</div>
		{/if}
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

	<div class="field">
		<label for="pr-notes">Notes (optionnel)</label>
		<textarea id="pr-notes" class="input" rows="2" bind:value={notes}></textarea>
	</div>

	<div class="actions">
		<button type="button" class="btn btn-ghost" onclick={ondone}>Annuler</button>
		<button type="submit" class="btn btn-primary" disabled={!valid}>
			{editing ? 'Enregistrer' : 'Créer le projet'}
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
	.cats,
	.accs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.cats button,
	.accs button {
		cursor: pointer;
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
	}
	.swatch.sel {
		outline-color: var(--text);
		outline-offset: 2px;
	}
	textarea.input {
		resize: vertical;
		font-family: inherit;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	@media (max-width: 520px) {
		.two {
			grid-template-columns: 1fr;
		}
	}
</style>
