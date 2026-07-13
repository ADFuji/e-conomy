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

## Tests

Le moteur financier est couvert par Vitest :

- Régression linéaire
- Capitalisation
- Fiscalité
- Gestion des plafonds
- Cascade de comptes
- Solveur d'objectif
- Migration de données
- Chiffrement

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