<script lang="ts">
	import { store, type Theme } from '$lib/store.svelte';
	import { encryptString, decryptString, isEncryptedPayload } from '$lib/crypto';
	import Modal from '$lib/components/Modal.svelte';

	const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD'];
	const HORIZONS = [1, 2, 5, 10, 20, 30];
	const THEMES: { value: Theme; label: string; icon: string }[] = [
		{ value: 'light', label: 'Clair', icon: '☀️' },
		{ value: 'dark', label: 'Sombre', icon: '🌙' },
		{ value: 'system', label: 'Système', icon: '💻' }
	];

	let importError = $state('');
	let importOk = $state(false);
	let confirmReset = $state(false);

	let encryptExport = $state(false);
	let exportPassword = $state('');

	async function exportJson() {
		const json = store.exportData();
		let content = json;
		let filename = `e-conomy-${new Date().toISOString().slice(0, 10)}.json`;
		if (encryptExport && exportPassword) {
			content = await encryptString(json, exportPassword);
			filename = `e-conomy-${new Date().toISOString().slice(0, 10)}.econ`;
		}
		const blob = new Blob([content], { type: encryptExport ? 'text/plain' : 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ---- Import (avec détection de chiffrement) --------------------------------

	let pendingEncrypted = $state<string | null>(null);
	let importPassword = $state('');
	let decryptError = $state('');

	function onImport(e: Event) {
		importError = '';
		importOk = false;
		decryptError = '';
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const content = String(reader.result);
			if (isEncryptedPayload(content)) {
				pendingEncrypted = content;
				importPassword = '';
			} else {
				try {
					store.importData(content);
					importOk = true;
				} catch (err) {
					importError = 'Fichier invalide : ' + (err as Error).message;
				}
			}
		};
		reader.readAsText(file);
		(e.target as HTMLInputElement).value = '';
	}

	async function confirmDecryptImport() {
		if (!pendingEncrypted) return;
		decryptError = '';
		try {
			const json = await decryptString(pendingEncrypted, importPassword);
			store.importData(json);
			importOk = true;
			pendingEncrypted = null;
		} catch (err) {
			decryptError = (err as Error).message;
		}
	}
</script>

<div class="page-head">
	<h1>Paramètres</h1>
	<p class="muted">Préférences d'affichage et gestion de vos données.</p>
</div>

<div class="settings">
	<div class="card card-pad">
		<h3 style="margin-bottom:16px">Affichage</h3>

		<div class="setting">
			<div>
				<div class="s-label">Thème</div>
				<div class="faint" style="font-size:13px">Apparence de l'interface.</div>
			</div>
			<div class="segmented">
				{#each THEMES as t}
					<button class="seg" class:active={store.theme === t.value} onclick={() => (store.theme = t.value)}>
						{t.icon} {t.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="setting">
			<div>
				<div class="s-label">Devise</div>
				<div class="faint" style="font-size:13px">Utilisée pour tous les montants.</div>
			</div>
			<select class="select" style="max-width:140px" bind:value={store.settings.currency}>
				{#each CURRENCIES as c}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</div>

		<div class="setting">
			<div>
				<div class="s-label">Horizon par défaut</div>
				<div class="faint" style="font-size:13px">Période de projection utilisée sur le tableau de bord.</div>
			</div>
			<div class="segmented">
				{#each HORIZONS as h}
					<button
						class="seg"
						class:active={store.settings.defaultHorizonYears === h}
						onclick={() => (store.settings.defaultHorizonYears = h)}
					>
						{h} an{h > 1 ? 's' : ''}
					</button>
				{/each}
			</div>
		</div>

		<div class="setting">
			<div>
				<div class="s-label">Inflation générale</div>
				<div class="faint" style="font-size:13px">Utilisée pour l'affichage « en euros constants ».</div>
			</div>
			<div class="input-affix" style="max-width:120px">
				<input type="number" step="0.1" bind:value={store.settings.generalInflationPct} />
				<span class="affix">%/an</span>
			</div>
		</div>

		<div class="setting">
			<div>
				<div class="s-label">Écart des scénarios</div>
				<div class="faint" style="font-size:13px">Points de taux ajoutés/retirés pour les projections optimiste/pessimiste.</div>
			</div>
			<div class="input-affix" style="max-width:120px">
				<input type="number" step="0.1" bind:value={store.settings.scenarioDeltaPct} />
				<span class="affix">pts</span>
			</div>
		</div>

		<div class="setting" style="border-bottom:none">
			<div>
				<div class="s-label">Taux de retrait pour la rente</div>
				<div class="faint" style="font-size:13px">Utilisé sur la page Indépendance pour estimer le capital nécessaire (ex. 4 % = « règle des 4 % »).</div>
			</div>
			<div class="input-affix" style="max-width:120px">
				<input type="number" step="0.1" bind:value={store.settings.withdrawalRatePct} />
				<span class="affix">%/an</span>
			</div>
		</div>
	</div>

	<div class="card card-pad">
		<h3 style="margin-bottom:8px">Vos données</h3>
		<p class="muted" style="font-size:14px;margin:0 0 16px">
			e-conomy fonctionne 100% localement : vos données sont stockées uniquement dans ce navigateur.
			Pensez à exporter une sauvegarde régulièrement.
		</p>

		<label class="toggle">
			<input type="checkbox" bind:checked={encryptExport} />
			<span>Chiffrer l'export avec un mot de passe</span>
		</label>
		{#if encryptExport}
			<div class="field" style="max-width:280px;margin-top:10px">
				<input
					class="input"
					type="password"
					placeholder="Mot de passe de chiffrement"
					bind:value={exportPassword}
				/>
				<span class="hint">
					Chiffrement AES-256 local (Web Crypto). Sans ce mot de passe, le fichier est illisible —
					ne l'oubliez pas.
				</span>
			</div>
		{/if}

		<div class="row" style="flex-wrap:wrap;margin-top:14px">
			<button
				class="btn btn-primary"
				disabled={encryptExport && !exportPassword}
				onclick={exportJson}
			>
				⬇️ Exporter {encryptExport ? '(chiffré)' : '(JSON)'}
			</button>

			<label class="btn">
				⬆️ Importer
				<input type="file" accept="application/json,.json,.econ" onchange={onImport} hidden />
			</label>

			<button class="btn" onclick={() => store.loadDemo()}>🎬 Charger l'exemple</button>
		</div>

		{#if importOk}
			<p class="pos" style="margin-top:12px;font-size:14px">✓ Données importées avec succès.</p>
		{/if}
		{#if importError}
			<p class="neg" style="margin-top:12px;font-size:14px">{importError}</p>
		{/if}
	</div>

	<div class="card card-pad danger-zone">
		<h3 style="margin-bottom:8px">Zone de danger</h3>
		<p class="muted" style="font-size:14px;margin:0 0 16px">
			Réinitialiser efface définitivement tous vos comptes et projets de ce navigateur.
		</p>
		{#if confirmReset}
			<div class="row">
				<span style="font-weight:600">Vraiment tout effacer ?</span>
				<button
					class="btn"
					style="background:var(--neg);border-color:var(--neg);color:#fff"
					onclick={() => {
						store.reset();
						confirmReset = false;
					}}
				>
					Oui, tout effacer
				</button>
				<button class="btn btn-ghost" onclick={() => (confirmReset = false)}>Annuler</button>
			</div>
		{:else}
			<button class="btn btn-danger" style="border:1px solid var(--border-strong)" onclick={() => (confirmReset = true)}>
				Réinitialiser toutes les données
			</button>
		{/if}
	</div>
</div>

<Modal bind:open={() => !!pendingEncrypted, (v) => { if (!v) pendingEncrypted = null; }} title="Fichier chiffré" width={420}>
	<p class="muted" style="font-size:14px;margin:0 0 14px">
		Ce fichier est protégé par un mot de passe. Saisissez-le pour l'importer.
	</p>
	<input
		class="input"
		type="password"
		placeholder="Mot de passe"
		bind:value={importPassword}
		onkeydown={(e) => e.key === 'Enter' && confirmDecryptImport()}
	/>
	{#if decryptError}
		<p class="neg" style="margin-top:10px;font-size:13px">{decryptError}</p>
	{/if}
	<div class="row" style="justify-content:flex-end;margin-top:18px">
		<button class="btn btn-ghost" onclick={() => (pendingEncrypted = null)}>Annuler</button>
		<button class="btn btn-primary" onclick={confirmDecryptImport}>Déchiffrer et importer</button>
	</div>
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
	.settings {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 760px;
	}
	.setting {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 0;
		border-bottom: 1px solid var(--border);
	}
	.setting:first-of-type {
		padding-top: 0;
	}
	.s-label {
		font-weight: 600;
	}
	.segmented {
		display: inline-flex;
		flex-wrap: wrap;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 3px;
		gap: 2px;
	}
	.seg {
		border: none;
		background: transparent;
		padding: 7px 12px;
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
	.danger-zone {
		border-color: color-mix(in srgb, var(--neg) 35%, var(--border));
	}
	label.btn {
		cursor: pointer;
	}
	@media (max-width: 560px) {
		.setting {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
