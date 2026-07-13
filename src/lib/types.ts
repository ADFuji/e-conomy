// Modèle de domaine de e-conomy.

export type AccountType =
	| 'courant'
	| 'livret'
	| 'pee'
	| 'per'
	| 'pea'
	| 'assurance_vie'
	| 'cto'
	| 'especes'
	| 'autre';

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string; hasYield: boolean }[] = [
	{ value: 'courant', label: 'Compte courant', icon: '💳', hasYield: false },
	{ value: 'livret', label: 'Livret (A, LDDS…)', icon: '📘', hasYield: true },
	{ value: 'pee', label: "Plan d'épargne entreprise", icon: '🏢', hasYield: true },
	{ value: 'per', label: "Plan d'épargne retraite", icon: '🌴', hasYield: true },
	{ value: 'pea', label: 'PEA', icon: '📈', hasYield: true },
	{ value: 'assurance_vie', label: 'Assurance-vie', icon: '🛡️', hasYield: true },
	{ value: 'cto', label: 'Compte-titres', icon: '📊', hasYield: true },
	{ value: 'especes', label: 'Espèces', icon: '💶', hasYield: false },
	{ value: 'autre', label: 'Autre', icon: '🐷', hasYield: true }
];

/** Fréquence de capitalisation des intérêts (comment ils s'ajoutent au capital). */
export type Compounding = 'annual' | 'monthly' | 'daily';

export const COMPOUNDINGS: { value: Compounding; label: string; hint: string }[] = [
	{ value: 'annual', label: 'Annuelle', hint: 'Le taux saisi est le rendement annuel (ex. Livret A).' },
	{ value: 'monthly', label: 'Mensuelle', hint: 'Intérêts capitalisés chaque mois.' },
	{
		value: 'daily',
		label: 'Journalière',
		hint: 'Intérêts calculés chaque jour et ajoutés au capital (ex. Revolut).'
	}
];

export type ContributionFrequency = 'monthly' | 'annual';

export interface Contribution {
	id: string;
	/** Montant du versement. */
	amount: number;
	frequency: ContributionFrequency;
	/** Mois du versement (1-12), requis pour un versement annuel. */
	month?: number;
	/** Jour du versement (1-31), indicatif. */
	day?: number;
}

export const MONTHS = [
	'Janvier',
	'Février',
	'Mars',
	'Avril',
	'Mai',
	'Juin',
	'Juillet',
	'Août',
	'Septembre',
	'Octobre',
	'Novembre',
	'Décembre'
];
export const MONTHS_SHORT = [
	'janv.',
	'févr.',
	'mars',
	'avr.',
	'mai',
	'juin',
	'juil.',
	'août',
	'sept.',
	'oct.',
	'nov.',
	'déc.'
];

export interface Account {
	id: string;
	name: string;
	type: AccountType;
	/** Solde du compte à la date `balanceDate` (pas forcément aujourd'hui). */
	balance: number;
	/**
	 * Premier jour du mois auquel `balance` est valable (ISO). Les simulations
	 * projettent ce solde jusqu'à aujourd'hui avant de démarrer la projection future.
	 */
	balanceDate: string;
	/** Le compte produit-il des intérêts ? */
	hasYield: boolean;
	/** Versements programmés (mensuels et/ou annuels). */
	contributions: Contribution[];
	/** Fréquence de capitalisation des intérêts. */
	compounding: Compounding;
	/** Taux annuel (en %) renseigné par année civile, ex. { 2024: 3, 2025: 2.5 }. Passé et futur autorisés. */
	ratesByYear: Record<number, number>;
	/**
	 * Si vrai, les années sans taux sont estimées via la tendance (tangente) des
	 * taux saisis. Sinon, `defaultRate` est utilisé tel quel.
	 */
	extrapolateRates: boolean;
	/** Taux annuel (en %) de repli, utilisé sans extrapolation ou avec < 2 taux saisis. */
	defaultRate: number;
	/** Plafond réglementaire (ex. 22 950 € pour un Livret A). Vide = illimité. */
	cap?: number;
	/** Compte vers lequel l'excédent au-delà du plafond est automatiquement viré. */
	overflowAccountId?: string;
	/** Les intérêts de ce compte sont-ils soumis à la fiscalité (PFU, etc.) ? */
	taxable?: boolean;
	/** Taux d'imposition appliqué aux intérêts (%), ex. 30 pour le PFU français. */
	taxRatePct?: number;
	color: string;
	createdAt: string;
}

/** Plafonds usuels des livrets réglementés français, pour pré-remplir le formulaire. */
export const COMMON_CAPS: Record<string, number> = {
	livret: 22950, // Livret A (référence la plus commune ; LDDS = 12 000)
	pea: 150000
};

export type ProjectCategory =
	| 'maison'
	| 'voiture'
	| 'urgence'
	| 'voyage'
	| 'retraite'
	| 'etudes'
	| 'enfant'
	| 'autre';

export const PROJECT_CATEGORIES: { value: ProjectCategory; label: string; icon: string }[] = [
	{ value: 'maison', label: 'Achat immobilier', icon: '🏡' },
	{ value: 'voiture', label: 'Véhicule', icon: '🚗' },
	{ value: 'urgence', label: "Épargne de précaution", icon: '🚨' },
	{ value: 'voyage', label: 'Voyage', icon: '✈️' },
	{ value: 'retraite', label: 'Retraite', icon: '🌅' },
	{ value: 'etudes', label: 'Études', icon: '🎓' },
	{ value: 'enfant', label: 'Enfant', icon: '🍼' },
	{ value: 'autre', label: 'Autre', icon: '🎯' }
];

/** Fraction d'un objectif atteinte, utilisée pour les jalons de progression. */
export const MILESTONE_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;
export type MilestoneKey = '25' | '50' | '75' | '100';
export const MILESTONE_KEYS: MilestoneKey[] = ['25', '50', '75', '100'];

export interface Project {
	id: string;
	name: string;
	/** Montant objectif à atteindre. */
	targetAmount: number;
	/** Date cible (ISO, optionnelle). */
	targetDate?: string;
	category: ProjectCategory;
	color: string;
	/** Comptes qui financent ce projet. Vide = tous les comptes. */
	fundingAccountIds: string[];
	notes?: string;
	/**
	 * Dates réelles (ISO) auxquelles chaque jalon a été atteint, déduites des
	 * pointages mensuels. Rempli automatiquement, jamais saisi à la main.
	 */
	milestonesAchieved?: Partial<Record<MilestoneKey, string>>;
	/**
	 * Le projet est-il terminé (argent dépensé) ? Un projet terminé n'est plus
	 * simulé comme objectif actif : son montant a déjà été retiré des comptes.
	 */
	completed?: boolean;
	/** Date (ISO) à laquelle le projet a été marqué terminé. */
	completedDate?: string;
	/** Montant réellement retiré de chaque compte à la clôture du projet. */
	withdrawals?: Record<string, number>;
	createdAt: string;
}

/** Mode d'allocation de l'épargne entre projets qui partagent des comptes. */
export type ProjectAllocationMode = 'shared' | 'priority';

export interface Settings {
	currency: string;
	locale: string;
	/** Horizon de simulation par défaut, en années. */
	defaultHorizonYears: number;
	/** Inflation générale (%), utilisée pour l'affichage « en euros constants ». */
	generalInflationPct: number;
	/** Écart de taux (points) appliqué aux scénarios optimiste/pessimiste. */
	scenarioDeltaPct: number;
	/** Comment l'épargne est répartie entre projets qui se partagent des comptes. */
	projectAllocationMode: ProjectAllocationMode;
	/** Taux de retrait annuel visé pour la rente (%), ex. 4 pour la « règle des 4 % ». */
	withdrawalRatePct: number;
}

/** Événement de vie ponctuel : dépense ou rentrée exceptionnelle sur un compte donné. */
export interface LifeEvent {
	id: string;
	label: string;
	/** Année civile de l'événement. */
	year: number;
	/** Mois (1-12) de l'événement. */
	month: number;
	/** Montant (négatif = dépense, positif = rentrée). */
	amount: number;
	accountId: string;
}

/** Pointage mensuel : soldes réels saisis pour comparer prévu vs réel dans le temps. */
export interface Snapshot {
	id: string;
	/** Premier jour du mois pointé (ISO). */
	date: string;
	/** Solde réel par compte à cette date. */
	balances: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
	currency: 'EUR',
	locale: 'fr-FR',
	defaultHorizonYears: 10,
	generalInflationPct: 2,
	scenarioDeltaPct: 1.5,
	projectAllocationMode: 'shared',
	withdrawalRatePct: 4
};

/**
 * Règle de virement automatique entre deux comptes, avec contraintes (fréquence,
 * montant maximum, plafond en % du salaire brut annuel). Utile pour des dispositifs
 * comme un PEE alimenté une fois par an, dans la limite de 25 % du salaire brut.
 */
export type TransferFrequency = 'monthly' | 'annual';

export interface TransferRule {
	id: string;
	label: string;
	fromAccountId: string;
	toAccountId: string;
	frequency: TransferFrequency;
	/** Mois d'exécution (1-12), utilisé seulement si frequency = 'annual'. */
	month?: number;
	/** Montant maximum transféré à chaque exécution. Vide = illimité. */
	maxAmount?: number;
	/** Plafonne le montant transféré à un % du salaire brut annuel (plan de revenus). */
	maxPctOfGrossIncome?: number;
	/** Solde minimum à laisser sur le compte source (le virement ne le fait jamais passer en dessous). */
	minSourceBalance?: number;
	enabled: boolean;
}

/** Augmentation ponctuelle : montant mensuel supplémentaire à partir d'une année. */
export interface Raise {
	id: string;
	year: number;
	amount: number;
}

/** Poste de dépense incompressible (loyer, eau, électricité, fibre…). */
export interface ExpenseItem {
	id: string;
	label: string;
	amount: number;
}

/** Modèle de départ pour les besoins vitaux (total 1 600 €). */
export function starterExpenses(): ExpenseItem[] {
	const mk = (label: string, amount: number): ExpenseItem => ({
		id: crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2),
		label,
		amount
	});
	return [
		mk('Loyer / crédit', 900),
		mk('Courses', 400),
		mk('Électricité / gaz', 120),
		mk('Eau', 40),
		mk('Internet / téléphone', 45),
		mk('Transports', 95)
	];
}

/**
 * Plan de revenus : modélise le salaire net, son évolution, les besoins vitaux, et
 * la stratégie d'épargne qui en découle. La capacité d'épargne alimente les comptes
 * dans les simulations.
 */
export interface IncomePlan {
	enabled: boolean;
	/** Salaire net mensuel actuel. */
	netMonthlyIncome: number;
	/**
	 * Salaire brut mensuel actuel (optionnel). Sert uniquement de référence pour
	 * les règles de virement plafonnées en % du brut (ex. versement PEE).
	 */
	grossMonthlyIncome: number;
	/** Évolution annuelle moyenne du salaire (%). */
	annualRaisePct: number;
	/** Augmentations exceptionnelles (ex. +400 €/mois à partir de 2028). */
	raises: Raise[];
	/** Besoins vitaux détaillés par poste. */
	expenses: ExpenseItem[];
	/** Évolution annuelle des besoins vitaux (inflation, %). */
	expenseInflationPct: number;
	/** Part du surplus actuel (revenu − besoins) épargnée, en %. */
	baseSavingsRate: number;
	/** Part des revenus supplémentaires (augmentations) investie, en %. */
	raiseSavingsRate: number;
	/** Répartition de l'épargne vers les comptes : poids relatifs par identifiant. */
	allocation: Record<string, number>;
}

export function createDefaultIncomePlan(): IncomePlan {
	return {
		enabled: false,
		netMonthlyIncome: 2500,
		grossMonthlyIncome: 3200,
		annualRaisePct: 2,
		raises: [],
		expenses: starterExpenses(),
		expenseInflationPct: 2,
		baseSavingsRate: 50,
		raiseSavingsRate: 80,
		allocation: {}
	};
}
