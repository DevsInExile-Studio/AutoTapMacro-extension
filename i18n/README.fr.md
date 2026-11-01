<p align="center"><img src="../docs/assets/github-banner.png" alt="AutoTap Macro — Enregistrez. Rejouez. Personnalisez." width="100%"></p>

<p align="center"><strong>Un petit atelier pour vos routines dans le navigateur, votre JavaScript et des outils pratiques pour les pages web.</strong></p>

<!-- Replace the Chrome Web Store homepage URL below with your extension listing URL. -->
<p align="center">
  <a href="https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro"><img src="../docs/assets/google-play-badge.svg" alt="Retrouvez l’application Android sur Google Play" width="220" height="64"></a>
  <a href="https://chromewebstore.google.com/"><img src="../docs/assets/chrome-web-store-badge.svg" alt="Installer depuis le Chrome Web Store" width="220" height="64"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.2-6c9a3e?style=flat-square" alt="Version 1.4.2">
  <img src="https://img.shields.io/badge/Chrome-138%2B-67563e?style=flat-square" alt="Chrome 138 ou version ultérieure">
  <img src="https://img.shields.io/badge/Manifest-V3-67563e?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/storage-local-6c9a3e?style=flat-square" alt="Stockage local">
</p>

<p align="center"><a href="../README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.hi.md">हिन्दी</a> · <a href="README.ar.md">العربية</a> · <strong>Français</strong></p>

Installez l’extension depuis le Chrome Web Store ou chargez-la localement. L’interface est en anglais.

## Un espace, trois façons d’automatiser

| Macros | Scripts utilisateur | Outils de page |
| --- | --- | --- |
| Enregistrez les clics, les cinq boutons standard de la souris, les mouvements du pointeur, les appuis maintenus, le glisser-déposer HTML, la molette, la saisie et le défilement. | Écrivez ou importez des fichiers `.js` / `.user.js`. Exécutez-les une fois ou automatiquement sur les sites choisis avec les API GM prises en charge. | Extrayez des éléments répétés à l’aide de sélecteurs CSS, prévisualisez un tableau, puis exportez en CSV ou JSON. |
| Modifiez les actions, les sélecteurs et les délais. Réglez les cycles, la vitesse, les attentes, les vérifications de texte et la gestion des erreurs. | Utilisez des valeurs propres à chaque script, des requêtes réseau, des ressources, des commandes, des notifications, des téléchargements et l’écriture dans le presse-papiers. | Organisez favoris et étiquettes, adaptez les exemples, consultez Activity et exportez des sauvegardes JSON. |

Pendant l’enregistrement, des repères discrets et un carrousel d’actions sur une seule ligne apparaissent au-dessus d’une barre Pause/Stop compacte et déplaçable. Les préférences de réduction des animations sont respectées. Les données restent dans le profil du navigateur, sauf si vous les exportez ou si votre script envoie une requête.

<p align="center"><img src="../store/screenshot-macros-1280x800.png" alt="Éditeur de macros avec une routine enregistrée, les délais et les actions" width="100%"></p>

<details>
<summary><strong>Voir les quatre autres captures</strong></summary>

| Enregistrement en direct | Éditeur JavaScript |
| --- | --- |
| ![Retour visuel sur un site de démonstration](../store/screenshot-recording-1280x800.png) | ![Éditeur de scripts utilisateur](../store/screenshot-javascript-1280x800.png) |
| Accès et compatibilité des scripts | Export des données de page |
| ![Paramètres réseau et fichiers joints](../store/screenshot-compatibility-1280x800.png) | ![Aperçu de l’extraction](../store/screenshot-toolbox-1280x800.png) |

</details>

## Installation locale

1. Téléchargez ou clonez ce dépôt. Utilisez **Chrome 138 ou une version ultérieure**.
2. Ouvrez `chrome://extensions` et activez **Developer mode**.
3. Cliquez sur **Load unpacked** et sélectionnez le dossier **`chrome/`** du dépôt.
4. Ouvrez un site HTTP(S) ordinaire → icône AutoTap → **Record this tab**. Effectuez les actions, puis cliquez sur **Stop**. **Open workshop** permet de modifier ou rejouer la routine.

Pour une mise à jour, conservez le dossier d’installation, remplacez ses fichiers et cliquez sur **Reload** sur la carte de l’extension. Actualisez les onglets des sites. Aucune compilation ni installation de l’application Android n’est nécessaire.

Raccourcis : **Alt+Shift+R** pour enregistrer ; **Alt+Shift+X** pour arrêter. Modifiez-les dans `chrome://extensions/shortcuts`.

## Votre propre JavaScript

Activez **Allow user scripts** dans les détails d’AutoTap dans Chrome. Dans l’atelier, ouvrez **JavaScript**, créez ou importez un script, vérifiez ses autorisations et cliquez sur **Run once**. Pour l’exécution automatique, définissez les règles des sites, activez l’option et enregistrez. Les scripts importés ont l’exécution automatique désactivée.

La compatibilité avec Tampermonkey est **partielle** : les API implémentées proposent les formes historiques `GM_*` et modernes `GM.*`. Les fichiers déclarés avec `@require` / `@resource` peuvent être joints localement ou téléchargés explicitement dans un brouillon pour vérification. Ils ne sont ni téléchargés ni mis à jour silencieusement. Consultez la [matrice de compatibilité](../docs/COMPATIBILITY.md), en anglais.

## Confidentialité et limites pratiques

- Aucun compte, outil d’analyse intégré ou serveur exploité par l’extension. Les autorisations des sites et des fonctions natives sont demandées selon les besoins. Les scripts peuvent contacter les destinations que vous autorisez.
- Les mots de passe, fichiers et champs reconnus de paiement ou de code à usage unique sont ignorés. Les textes ordinaires, scripts, journaux et sauvegardes peuvent contenir des données personnelles.
- Les macros et l’extraction fonctionnent dans le document principal. Une navigation termine la session. Les pages internes de Chrome, le Chrome Web Store, le shadow DOM et les sites exigeant des événements matériels de confiance ne sont pas pris en charge.
- `unsafeWindow`, les API de cookies, les réponses en streaming et les mises à jour automatiques des scripts ne sont pas pris en charge. **Stop** arrête les macros ; rechargez la page pour supprimer les temporisateurs ou écouteurs de scripts arbitraires.

[Confidentialité de l’extension](../store/PRIVACY.md) · [Site du développeur](https://devs-in-exile.pages.dev/) · [Notes sur les entrées et les performances](../docs/PERFORMANCE.md)

## Également sur Android

[AutoTap Macro sur Google Play](https://play.google.com/store/apps/details?id=com.devsinexile.autotapmacro) enregistre et rejoue des appuis dans les applications Android. L’extension et l’application ont des collections et formats distincts, sans synchronisation.

## Développement et ressources

Le code de l’extension se trouve dans `chrome/`, les traductions dans `i18n/`, le bandeau et les badges dans `docs/assets/`. `store/` contient cinq captures de **1280 × 800** et deux images promotionnelles de **440 × 280 / 1400 × 560**.

```sh
npm install
npm test
npm run test:browser
npm run assets
```

[Compilation, tests navigateur et paquets](../docs/DEVELOPMENT.md) · [Signaler un problème](https://github.com/DevsInExile-Studio/AutoTapMacro-extension/issues) · [Contact](mailto:DevsInExileStudio@outlook.com)
