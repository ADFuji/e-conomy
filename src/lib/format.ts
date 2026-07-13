// Helpers de formatage (devise, pourcentage, dates).

import { store } from './store.svelte';
import { MONTHS_SHORT, type Contribution } from './types';

export function money(n: number | null | undefined, fractionDigits = 0): string {
	return new Intl.NumberFormat(store.settings.locale, {
		style: 'currency',
		currency: store.settings.currency,
		maximumFractionDigits: fractionDigits,
		minimumFractionDigits: fractionDigits
	}).format(n ?? 0);
}

/** Version compacte pour les axes de graphique (12 k €, 1,2 M €). */
export function moneyCompact(n: number | null | undefined): string {
	return new Intl.NumberFormat(store.settings.locale, {
		style: 'currency',
		currency: store.settings.currency,
		notation: 'compact',
		maximumFractionDigits: 1
	}).format(n ?? 0);
}

export function percent(n: number | null | undefined, fractionDigits = 2): string {
	const v = new Intl.NumberFormat(store.settings.locale, {
		maximumFractionDigits: fractionDigits,
		minimumFractionDigits: 0
	}).format(n ?? 0);
	return `${v} %`;
}

export function monthYear(d: Date): string {
	return new Intl.DateTimeFormat(store.settings.locale, {
		month: 'short',
		year: 'numeric'
	}).format(d);
}

export function fullDate(d: Date | string): string {
	const date = typeof d === 'string' ? new Date(d) : d;
	return new Intl.DateTimeFormat(store.settings.locale, {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(date);
}

/** Libellé court d'un versement, ex. "＋200 € / mois" ou "＋1 500 € / an (déc.)". */
export function contributionLabel(c: Contribution): string {
	const amount = `＋${money(c.amount)}`;
	if (c.frequency === 'monthly') return `${amount} / mois`;
	return `${amount} / an (${MONTHS_SHORT[(c.month ?? 1) - 1]})`;
}

/** Durée lisible entre aujourd'hui et une date future (ex. "3 ans et 4 mois"). */
export function durationFromNow(target: Date): string {
	const now = new Date();
	let months =
		(target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
	if (months <= 0) return "moins d'un mois";
	const years = Math.floor(months / 12);
	months = months % 12;
	const parts: string[] = [];
	if (years > 0) parts.push(`${years} an${years > 1 ? 's' : ''}`);
	if (months > 0) parts.push(`${months} mois`);
	return parts.join(' et ');
}
