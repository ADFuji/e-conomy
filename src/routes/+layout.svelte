<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { browser, dev } from '$app/environment';
	import { store } from '$lib/store.svelte';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';


	injectAnalytics({ mode: dev ? 'development' : 'production' });
	injectSpeedInsights();

	let { children } = $props();

	// PWA : n'enregistre le service worker qu'en production, pour ne pas
	// interférer avec le rechargement à chaud (HMR) du serveur de dev.
	if (browser && !dev && 'serviceWorker' in navigator) {
		navigator.serviceWorker.register('/sw.js').catch(() => {});
	}

	const nav = [
		{ href: '/', label: "Vue d'ensemble", icon: '🏠' },
		{ href: '/comptes', label: 'Comptes', icon: '🏦' },
		{ href: '/revenus', label: 'Revenus', icon: '💰' },
		{ href: '/projets', label: 'Projets', icon: '🎯' },
		{ href: '/simulations', label: 'Simulations', icon: '📈' },
		{ href: '/pointage', label: 'Pointage', icon: '📍' },
		{ href: '/independance', label: 'Indépendance', icon: '🏖️' },
		{ href: '/parametres', label: 'Paramètres', icon: '⚙️' }
	];

	// Sur mobile, la barre du haut cède la place à une tab bar en bas d'écran :
	// les 4 sections les plus utilisées restent directes, le reste passe par « Plus ».
	const primaryMobileHrefs = ['/', '/comptes', '/projets', '/pointage'];
	const primaryNav = nav.filter((n) => primaryMobileHrefs.includes(n.href));
	const moreNav = nav.filter((n) => !primaryMobileHrefs.includes(n.href));

	let showMore = $state(false);

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
	const moreActive = $derived(moreNav.some((n) => isActive(n.href)));

	function cycleTheme() {
		store.theme = store.theme === 'dark' ? 'light' : 'dark';
	}
</script>

<div class="app">
	<header class="topbar">
		<div class="container bar">
			<a href="/" class="brand">
				<span class="logo">€</span>
				<span class="brand-name">e-conomy</span>
			</a>

			<nav class="nav">
				{#each nav as item}
					<a href={item.href} class="nav-link" class:active={isActive(item.href)}>
						<span class="nav-icon">{item.icon}</span>
						<span class="nav-label">{item.label}</span>
					</a>
				{/each}
			</nav>

			<button class="btn btn-icon btn-ghost theme-btn" onclick={cycleTheme} aria-label="Changer de thème">
				{store.theme === 'dark' ? '☀️' : '🌙'}
			</button>
		</div>
	</header>

	<main class="container page">
		{@render children()}
	</main>

	<footer class="foot">
		<div class="container">
			e-conomy — vos données restent sur votre appareil.
		</div>
	</footer>

	<!-- Tab bar mobile : remplace la nav du haut sous ~700px. -->
	<nav class="tabbar" aria-label="Navigation principale">
		{#each primaryNav as item}
			<a href={item.href} class="tab" class:active={isActive(item.href)}>
				<span class="tab-icon">{item.icon}</span>
				<span class="tab-label">{item.label === "Vue d'ensemble" ? 'Accueil' : item.label}</span>
			</a>
		{/each}
		<button
			type="button"
			class="tab"
			class:active={moreActive}
			onclick={() => (showMore = !showMore)}
			aria-expanded={showMore}
		>
			<span class="tab-icon">⋯</span>
			<span class="tab-label">Plus</span>
		</button>
	</nav>

	{#if showMore}
		<button class="sheet-backdrop" aria-label="Fermer" onclick={() => (showMore = false)}></button>
		<div class="sheet">
			{#each moreNav as item}
				<a href={item.href} class="sheet-link" class:active={isActive(item.href)} onclick={() => (showMore = false)}>
					<span class="tab-icon">{item.icon}</span>
					{item.label}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 62px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 800;
		font-size: 18px;
		letter-spacing: -0.02em;
	}
	.logo {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: linear-gradient(135deg, var(--brand), #8b5cf6);
		color: #fff;
		font-weight: 800;
		box-shadow: var(--shadow-sm);
	}
	.nav {
		display: flex;
		gap: 2px;
		margin-left: auto;
		background: var(--surface-2);
		padding: 4px;
		border-radius: 12px;
		border: 1px solid var(--border);
	}
	.nav-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 14px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 14px;
		color: var(--text-muted);
		transition:
			background 0.15s,
			color 0.15s;
	}
	.nav-link:hover {
		color: var(--text);
	}
	.nav-link.active {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-sm);
	}
	.nav-icon {
		font-size: 15px;
	}
	.theme-btn {
		flex: none;
	}
	.page {
		flex: 1;
		padding-top: 28px;
		padding-bottom: 48px;
		width: 100%;
	}
	.foot {
		border-top: 1px solid var(--border);
		padding: 18px 0;
		font-size: 13px;
		color: var(--text-faint);
		text-align: center;
	}

	@media (max-width: 760px) and (min-width: 701px) {
		.brand-name {
			display: none;
		}
		.nav-label {
			display: none;
		}
		.nav-link {
			padding: 8px 11px;
		}
		.nav-icon {
			font-size: 17px;
		}
	}

	/* ---- Tab bar mobile (remplace la nav du haut sous 700px) ---- */
	.tabbar,
	.sheet-backdrop,
	.sheet {
		display: none;
	}

	@media (max-width: 700px) {
		.nav {
			display: none;
		}
		.page {
			padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
		}
		.foot {
			padding-bottom: calc(18px + 64px + env(safe-area-inset-bottom, 0px));
		}

		.tabbar {
			display: flex;
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
			backdrop-filter: blur(12px);
			border-top: 1px solid var(--border);
			padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
		}
		.tab {
			flex: 1;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 2px;
			padding: 6px 2px;
			border-radius: 10px;
			color: var(--text-faint);
			background: transparent;
			border: none;
			font: inherit;
		}
		.tab.active {
			color: var(--brand);
		}
		.tab-icon {
			font-size: 19px;
			line-height: 1;
		}
		.tab-label {
			font-size: 10.5px;
			font-weight: 600;
		}

		.sheet-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(15, 23, 42, 0.45);
			border: none;
			z-index: 31;
		}
		.sheet {
			display: flex;
			flex-direction: column;
			gap: 2px;
			position: fixed;
			left: 12px;
			right: 12px;
			bottom: calc(76px + env(safe-area-inset-bottom, 0px));
			z-index: 32;
			background: var(--bg-elevated);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			box-shadow: var(--shadow-lg);
			padding: 8px;
		}
		.sheet-link {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 12px 12px;
			border-radius: 10px;
			font-weight: 600;
			font-size: 15px;
			color: var(--text);
		}
		.sheet-link:hover {
			background: var(--surface-2);
		}
		.sheet-link.active {
			color: var(--brand);
			background: var(--brand-soft);
		}
	}
</style>
