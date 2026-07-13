<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		children,
		footer,
		width = 560
	}: {
		open: boolean;
		title: string;
		children: Snippet;
		footer?: Snippet;
		width?: number;
	} = $props();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div
		class="overlay"
		role="button"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) open = false;
		}}
		onkeydown={() => {}}
	>
		<div class="modal" style={`max-width:${width}px`} role="dialog" aria-modal="true" aria-label={title}>
			<header>
				<h3>{title}</h3>
				<button class="btn btn-icon btn-ghost" onclick={() => (open = false)} aria-label="Fermer">✕</button>
			</header>
			<div class="body">
				{@render children()}
			</div>
			{#if footer}
				<footer>{@render footer()}</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.5);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 40px 16px;
		z-index: 50;
		overflow-y: auto;
		animation: fade 0.12s ease;
	}
	.modal {
		width: 100%;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		animation: pop 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.2);
		margin: auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 20px;
		border-bottom: 1px solid var(--border);
	}
	header h3 {
		font-size: 17px;
	}
	.body {
		padding: 20px;
	}
	footer {
		padding: 16px 20px;
		border-top: 1px solid var(--border);
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}
</style>
