# 💶 e-conomy

Application de **planification de budget et d'épargne**. Définissez des **projets**
(achat maison, voiture, épargne de précaution…), déclarez vos **comptes en banque**
avec leurs **taux d'intérêt par année**, modélisez vos **revenus**, et visualisez la
puissance des **intérêts composés** sur 1 à 30 ans.

> 🔒 **100 % local** — vos données restent dans votre navigateur (localStorage).
> Aucun serveur, aucun compte, aucune donnée envoyée nulle part. Sauvegarde
> chiffrable par mot de passe, application installable (PWA).

## Fonctionnalités

### Comptes
- Compte courant, Livret A, PEE, PER, PEA, assurance-vie, compte-titres…
- **Versements programmés** : mensuels et/ou annuels à une date choisie.
- **Taux d'intérêt par année civile**, passé comme futur. Les années non renseignées
  sont **extrapolées par régression linéaire** (la tangente de la tendance) ou par un
  taux de repli.
- **Capitalisation** annuelle, mensuelle ou **journalière** (type Revolut).
- **Plafonds réglementaires** (ex. Livret A) avec **débordement automatique** en
  cascade vers un compte de repli quand le plafond est atteint.
- **Fiscalité** optionnelle sur les intérêts (ex. PFU 30 %), appliquée mois par mois.

### Revenus
- Modélisez votre **salaire net**, sa croissance annuelle et des **augmentations
  ponctuelles**.
- Détaillez vos **besoins vitaux poste par poste** (loyer, courses, énergie…) avec
  leur propre inflation.
- Stratégie d'épargne à deux leviers : part du surplus actuel épargnée, et surtout
  **part des augmentations investie** (« mes besoins sont couverts, j'investis ce que
  je gagne en plus »).
- **Événements de vie** : dépenses ou rentrées ponctuelles planifiées sur un compte à
  une date donnée (achat, prime, travaux…).
- La capacité d'épargne qui en résulte est **répartie sur vos comptes** et alimente
  automatiquement les simulations.

### Projets
- Objectifs chiffrés avec date cible optionnelle, financés par tout ou partie de vos
  comptes. e-conomy estime **la date d'atteinte** au rythme actuel.
- **Jalons** (25/50/75/100 %) avec date réelle d'atteinte déduite de vos pointages.
- Mode **priorité** : quand plusieurs projets partagent l'épargne, définissez un ordre
  (réorganisable par glisser des flèches) — le premier est financé en premier.
- **Solveur d'objectif inversé** : « combien dois-je épargner par mois pour tenir la
  date cible ? », résolu par bissection sur la simulation réelle (taux, plafonds,
  fiscalité, événements inclus).

### Simulations
- Vue *total cumulé* ou *comparaison par compte*, tableau détaillé année par année.
- **Scénarios optimiste / pessimiste** (± un écart de taux configurable).
- **Comparateur de scénario B** : testez un versement ou un écart de taux alternatif
  sans modifier vos données.
- Affichage **en euros constants** (déflaté de l'inflation générale).

### Pointage
- Enregistrez le **solde réel** de chaque compte chaque mois.
- Comparaison **prévu vs réel**, patrimoine réel raccordé à la projection future.
- Alimente automatiquement les jalons atteints des projets.

### Réglages & données
- Thème clair / sombre / système, devise, inflation générale, écart des scénarios.
- **Export / import JSON**, avec option de **chiffrement par mot de passe**
  (AES-256-GCM via Web Crypto, tout se passe dans le navigateur).
- **Installable (PWA)** : manifest + service worker pour un usage hors-ligne basique.
- **Navigation mobile** : tab bar en bas d'écran sous 700 px, tableaux (pointage)
  adaptés en cartes empilées.

### Fiabilité
- **Soldes datés** : chaque compte a une `balanceDate`. Si elle n'est plus le mois
  courant, la simulation **rattrape automatiquement** le solde (rendement,
  versements, événements de vie connus) avant de projeter le futur — plus besoin
  de rouvrir l'app chaque mois pour que les chiffres restent justes.
- **Réconciliation pointage → comptes** : un bouton reporte le dernier pointage sur
  les soldes réels, pour que dashboard et pointage racontent toujours la même histoire.
- **Suite de tests** (Vitest) sur le moteur de simulation : régression linéaire,
  capitalisation, fiscalité, cascade de plafonds, solveur, migrations, chiffrement.

## Stack

SvelteKit 2 + Svelte 5 (runes) + TypeScript, rendu 100 % client (adapter-static en
mode SPA). Graphiques en SVG maison, aucune dépendance de visualisation. Tests
avec Vitest.

## Développement

```sh
npm install
npm run dev        # serveur de dev
npm run check      # vérification TypeScript / Svelte
npm run test       # suite de tests (Vitest)
npm run build      # build de production (dossier ./build, statique)
npm run preview    # prévisualise le build
```

Le build est un site **statique** : déployable sur n'importe quel hébergeur de fichiers
(GitHub Pages, Netlify, un simple dossier…).

## Structure

```
src/
  lib/
    types.ts              # modèle de domaine (Account, Project, IncomePlan, Settings…)
    finance.ts             # cœur métier : moteur de simulation unifié + rattrapage
    finance.test.ts         # tests du moteur (Vitest)
    migrations.ts            # migrations de données pures, testables
    migrations.test.ts
    format.ts              # formatage devise / % / dates (Intl)
    crypto.ts               # chiffrement AES-256-GCM de l'export (Web Crypto)
    crypto.test.ts
    store.svelte.ts        # état global + persistance localStorage (runes)
    components/
      LineChart.svelte     # courbe/aire multi-séries (SVG)
      DonutChart.svelte    # répartition (SVG)
      Modal.svelte
      RatesEditor.svelte   # saisie des taux par année + extrapolation
      ContributionsEditor.svelte
      AccountForm.svelte   # plafond, fiscalité, capitalisation…
      ProjectForm.svelte
  routes/
    +layout.svelte         # coquille + navigation + enregistrement du service worker
    +page.svelte            # tableau de bord
    comptes/                # gestion des comptes
    revenus/                 # plan de revenus, besoins détaillés, événements de vie
    projets/                 # gestion des projets, priorité, jalons, solveur
    simulations/              # outil de simulation, scénarios, comparateur
    pointage/                 # instantanés mensuels, prévu vs réel
    parametres/               # préférences, export/import chiffré
static/
  manifest.webmanifest, sw.js, icons/  # PWA
```

## Modèle de calcul

Avant toute projection, `simulatePortfolio` **rattrape** chaque compte dont le solde
est daté dans le passé (`catchUpAccount`) : il rejoue rendement, versements et
événements de vie connus entre `balanceDate` et aujourd'hui, en réutilisant le même
moteur. Sans ça, un compte non retouché depuis 3 mois fausserait toute la simulation.

Le moteur (`runSimulation` dans `finance.ts`) simule ensuite **tous les comptes
ensemble, mois par mois**, car certains effets sont transversaux :

1. **Croissance** : le taux annuel de l'année civile (saisi, extrapolé par tangente,
   ou taux de repli), ajusté d'un éventuel écart de scénario, converti en facteur
   mensuel selon la capitalisation :

   ```
   annuelle    : (1 + r)^(1/12)
   mensuelle   : 1 + r/12
   journalière : (1 + r/365)^(jours du mois)
   ```

   Si le compte est fiscalisé, seule la part « intérêts » du facteur est amputée du
   taux d'imposition (le capital n'est jamais taxé).

2. **Versements** : fixes (mensuels/annuels), plus la part du plan de revenus
   allouée à ce compte, plus les événements de vie du mois.

3. **Plafonds & cascade** : si un compte dépasse son plafond, l'excédent est
   transféré (plusieurs passes pour gérer les chaînes) vers son compte de
   débordement, sans créer ni détruire de valeur.

Un projet agrège ses comptes de financement (ou tous si aucun n'est sélectionné). En
mode priorité, l'épargne totale du portefeuille est répartie en cascade entre projets
selon leur ordre.

### Capacité d'épargne (plan de revenus)

```
revenu(t)      = salaire × (1 + croissance)^t + Σ augmentations actives
besoins(t)     = Σ postes × (1 + inflation)^t
investi(t)     = (revenu₀ − besoins₀) × tauxBase
               + max(0, [revenu(t) − revenu₀] − [besoins(t) − besoins₀]) × tauxAugmentations
```

### Solveur d'objectif inversé

`requiredMonthlyContribution` cherche par **bissection** le versement mensuel
supplémentaire (réparti sur les comptes de financement) qui fait atteindre l'objectif
exactement à la date cible, en réutilisant le moteur de simulation complet — taux,
plafonds, fiscalité et événements de vie inclus.
 
 