# 💶 e-conomy

Application de **planification financière personnelle** permettant de simuler un budget, une stratégie d'épargne et l'évolution d'un patrimoine dans le temps.

Créez vos **projets** (achat immobilier, voiture, épargne de précaution…), configurez vos **comptes financiers** avec leurs rendements, modélisez vos **revenus et dépenses**, puis visualisez l'impact des **intérêts composés** sur une période de 1 à 30 ans.

> 🔒 **100 % local** — vos données restent dans votre navigateur (`localStorage`).  
> Aucun serveur, aucun compte utilisateur, aucune donnée transmise.  
> Export chiffré par mot de passe disponible. Application installable en **PWA**.

---

# Fonctionnalités

## 💳 Comptes

- Gestion de différents types de comptes :
  - Compte courant
  - Livret A
  - PEE
  - PER
  - PEA
  - Assurance-vie
  - Compte-titres
  - Comptes personnalisés

- Versements programmés :
  - Mensuels
  - Annuels avec date configurable

- Gestion des rendements :
  - Taux par année civile (passé et futur)
  - Extrapolation automatique des années manquantes par régression linéaire
  - Taux de repli configurable

- Modes de capitalisation :
  - Annuelle
  - Mensuelle
  - Journalière (type intérêts quotidiens)

- Gestion des plafonds :
  - Plafonds réglementaires (ex : Livret A)
  - Débordement automatique vers un compte relais
  - Cascade de plusieurs comptes possible

- Fiscalité optionnelle :
  - Exemple : PFU 30 %
  - Application uniquement sur les intérêts générés

---

# 💰 Revenus

Modélisez votre évolution financière :

- Salaire net initial
- Croissance annuelle
- Augmentations ponctuelles

Gestion détaillée des dépenses :

- Loyer
- Alimentation
- Énergie
- Transport
- Loisirs
- Toute dépense personnalisée

Chaque poste possède sa propre inflation.

## Stratégie d'épargne avancée

Deux leviers sont disponibles :

1. Épargne d'une partie du surplus actuel
2. Investissement automatique des futures augmentations :

> "Mes besoins sont couverts, j'investis ce que je gagne en plus."

## Reste à vivre & garde-fou

La page Revenus affiche le **reste à vivre** mensuel (revenu − besoins −
versements fixes − épargne du plan) et alerte quand l'épargne programmée dépasse
le budget disponible. Une option **plafonne automatiquement** l'épargne du plan au
surplus réellement disponible, mois par mois.

## Événements de vie

Planifiez des événements ponctuels :

- Achat immobilier
- Travaux
- Prime
- Dépense exceptionnelle
- Entrée d'argent

Ces événements sont automatiquement intégrés aux simulations.

---

# 🎯 Projets

Définissez vos objectifs financiers :

- Montant cible
- Date souhaitée
- Comptes utilisés pour le financement

e-conomy calcule :

- La date probable d'atteinte
- La progression actuelle
- L'évolution future

## Jalons

Suivez automatiquement les étapes :

- 25 %
- 50 %
- 75 %
- 100 %

Les dates réelles d'atteinte sont calculées depuis vos pointages.

## Priorisation

Lorsque plusieurs projets utilisent la même capacité d'épargne :

- Définissez un ordre de priorité
- Réorganisez facilement les projets
- Le premier projet reçoit l'épargne en priorité

## Solveur d'objectif inversé

Répondez à une question simple :

> "Combien dois-je investir chaque mois pour atteindre mon objectif à cette date ?"

Le solveur utilise une recherche par bissection sur la simulation complète :

- Rendements
- Fiscalité
- Plafonds
- Événements
- Répartition entre comptes

## Clôture d'un projet

Le but d'un projet est d'être dépensé, pas de fructifier indéfiniment.

Marquer un projet comme **terminé** retire son montant des comptes qui le financent, réparti selon un ordre logique :

- Le compte courant (non rémunéré) est toujours débité en premier
- Pour un achat immobilier : PEE → Livret → PEA, après le compte courant
- Sinon : du compte le moins rémunérateur au plus rémunérateur

Les projets **actifs** sont eux-mêmes modélisés comme des dépenses futures dans les simulations globales (dashboard, simulations, indépendance financière) : l'argent qui leur est destiné n'est pas compté comme s'il allait fructifier indéfiniment.

Un aperçu du retrait (compte par compte) est affiché avant confirmation. Les projets terminés restent consultables, avec la possibilité de les rouvrir.

---

# 🔀 Règles de virement automatique

Au-delà des plafonds simples, définissez des règles de virement entre deux comptes avec des contraintes réalistes :

- Fréquence : chaque mois, ou une fois par an à un mois donné
- Montant maximum par exécution
- Plafond exprimé en **% du salaire brut annuel** (plan de revenus)
- Solde minimum à laisser sur le compte source

Exemple : un versement sur un PEE une fois par an, juste après le calcul des intérêts, plafonné à 25 % du salaire brut.

---

# 📈 Simulations

Visualisez votre évolution financière :

- Patrimoine total cumulé
- Détail par compte
- Projection annuelle
- Simulation sur 1 à 30 ans

## Scénarios

Comparez différentes hypothèses :

- Optimiste
- Pessimiste
- Écart de rendement configurable

## Comparateur

Testez un scénario alternatif :

- Nouveau versement
- Variation de rendement

Sans modifier vos données principales.

## Valeur réelle

Affichage possible en euros constants :

- Correction par inflation
- Comparaison du pouvoir d'achat réel

---

# 🩺 Conseils (insights)

Le tableau de bord affiche des conseils actionnables détectés automatiquement à
partir de vos données et de leur projection sur 24 mois, triés par gravité :

- **Compte à découvert** projeté (date + montant)
- **Budget intenable** : l'épargne programmée dépasse le surplus disponible
- **Plafond atteint** sans compte de débordement
- **Projets en retard** sur leur date cible
- **Argent dormant** sur des comptes non rémunérés
- **Pointage / solde ancien** à rafraîchir
- **Rendement à 0 %** faute de taux renseigné pour l'année

Moteur pur dans `src/lib/insights.ts` (règles testées unitairement).

---

# 📅 Timeline

Une feuille de route chronologique de tout ce qui va se passer, regroupée par
année et par mois :

- Retraits des projets à leur clôture
- Virements automatiques annuels (ex. versement PEE)
- Augmentations de salaire, événements de vie
- Plafonds atteints, objectifs projetés, dates cibles
- Date estimée d'indépendance financière

Sélecteur d'horizon (1 / 2 / 5 / 10 ans). Moteur pur dans `src/lib/timeline.ts`.

---

# 📌 Pointage

Suivez votre patrimoine réel :

- Saisie mensuelle des soldes
- Comparaison prévu / réel
- Reconnexion automatique avec les projections

Les pointages alimentent automatiquement :

- Les jalons des projets
- Le suivi de progression

---

# ⚙️ Réglages & données

Configuration disponible :

- Thème clair / sombre / système
- Devise
- Inflation générale
- Écart des scénarios

## Export / import

- Export JSON complet
- Import JSON
- Chiffrement optionnel par mot de passe

Technologies utilisées :

- AES-256-GCM
- Web Crypto API
- Traitement uniquement côté navigateur

## Application PWA

Disponible hors ligne :

- Manifest
- Service worker
- Installation sur ordinateur et mobile

Interface responsive :

- Navigation mobile par barre inférieure
- Tableaux convertis en cartes sous 700 px

---

# 🏖️ Indépendance financière

À partir de quel capital pouvez-vous vous verser une rente qui couvre vos frais fixes ?

- Capital nécessaire calculé selon un taux de retrait configurable (ex. 4 %/an, la « règle des 4 % »)
- Projection du patrimoine jusqu'à l'échéance estimée, comparée au capital nécessaire
- Répartition **croissance / sécurisé** actuelle du patrimoine
- Cible indicative de répartition selon l'horizon restant (glide path : plus l'échéance est lointaine, plus on vise la croissance)

Repère indicatif, pas un conseil personnalisé.

---

# 🛡️ Fiabilité

## Soldes datés

Chaque compte possède une `balanceDate`.

Si cette date est ancienne, l'application rejoue automatiquement :

- Rendements
- Versements
- Événements planifiés

avant toute nouvelle projection.

Ainsi, un compte non consulté pendant plusieurs mois reste toujours cohérent.

## Réconciliation

Un bouton permet de synchroniser :
- Pointage réel → Solde du compte

afin de garder le tableau de bord et les simulations alignés.

## Performance

Le moteur est **mémoïsé** (cache LRU à clé = sérialisation des entrées) : une
simulation identique n'est jamais recalculée. Les pages recalculant tout à chaque
frappe restent fluides même avec de nombreux projets (≈ 37× plus rapide sur appel
répété mesuré).

## Tests

Le cœur métier est couvert par Vitest (79 tests) :

- Régression linéaire, capitalisation, fiscalité
- Gestion des plafonds, cascade de comptes
- Solveur d'objectif, ordre et répartition des retraits de projet
- Règles de virement automatique (fréquence, plafonds)
- Capital nécessaire à la rente, budget & plafonnement au surplus
- Mémoïsation du moteur
- Moteur d'insights, timeline
- Migration de données, chiffrement

---

# 🧱 Stack technique

- SvelteKit 2
- Svelte 5 (runes)
- TypeScript
- Adapter-static (SPA)
- SVG natif pour les graphiques
- Vitest pour les tests

Aucune dépendance externe de visualisation.

---

# 🚀 Développement

```bash
npm install

npm run dev        # serveur de développement
npm run check      # vérification TypeScript / Svelte
npm run test       # tests Vitest
npm run build      # build production
npm run preview    # prévisualisation du build