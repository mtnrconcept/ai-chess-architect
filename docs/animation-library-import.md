# Bibliothèque d'animations Aichess — import contrôlé

## Inventaire établi le 11 novembre 2026

- 690 GIF (69 séries de 10, séries 04–72), représentant environ 1,58 Go.
- 345 effets autonomes ; 345 effets avec pièce (pion, cavalier, tour, fou et dame).
- 690 GIF 512 × 512 et 48 images contrôlés dans l'espace de travail de génération.
- Aucun doublon binaire parmi ces 690 GIF. La ressemblance **visuelle** entre séries reste possible.
- Un inventaire SHA-256 accompagne les médias : `AICHESS_CATALOGUE_690_ANIMATIONS.json` et `.csv`.
- La transparence GIF est binaire (pas alpha 8 bits) ; préférer WebP/AVIF pour les effets alpha progressifs.

## Architecture

1. `src/fx/animationLibrary.ts` : références autorisées, tags, recherche et associations cosmétiques déterministes.
2. `src/pages/AnimationLibrary.tsx` : interface de recherche par catégorie, tag et pièce à `/animation-library`.
3. `src/fx/catalogGif.ts` : lecture des GIF par identifiant autorisé, sans URL fournie par l'utilisateur.
4. `src/lib/ruleCatalogue100.ts` : suggestions automatiques pour les cent règles du dictionnaire. Les règles restent validées par le compilateur V2.
5. `src/engine/adapters/vfxAdapter.ts` : proposition d'un GIF pour les règles historiques utilisant un identifiant de sprite non présent dans l'ancien catalogue. En cas d'absence, les effets procéduraux restent inchangés.
6. `public/aichess-animations/catalog.json` : catalogue généré UNIQUEMENT quand les médias présents sur disque ont passé la vérification SHA-256.

La bibliothèque ne modifie pas les conditions des règles, les cibles, les coups, la durée des tours ni le résultat d'une partie. Les associations historiques sont des correspondances **au rendu**, pas une réécriture des règles enregistrées en base. Les versions signées / immuables restent intactes.

## Transfert des 690 médias : phase à achever

La machine distante portant le dossier Git et/ou les fichiers sources doit être **connectée**. Le connecteur GitHub de cette session sait modifier des fichiers texte, mais ne permet pas de transmettre automatiquement 1,58 Go de médias présents dans un autre environnement local.

Depuis une machine où sont disponibles la copie du dépôt, l'inventaire JSON et les dossiers `AICHESS_serie_...` :

```bash
node scripts/import-aichess-animations.mjs /chemin/AICHESS_CATALOGUE_690_ANIMATIONS.json /chemin/dossier-sources --dry-run
node scripts/import-aichess-animations.mjs /chemin/AICHESS_CATALOGUE_690_ANIMATIONS.json /chemin/dossier-sources --import
```

Le script refuse toute archive inattendue, vérifie les empreintes SHA-256, préserve chaque GIF et convertit seulement les caractères non ASCII des noms de sortie. Le registre publié comporte alors les 690 références localement disponibles, et la page devient immédiatement filtrable.

**Avant un push massif :** un dépôt Git ordinaire ne convient pas à l'ajout incontrôlé de 1,58 Go d'animations. Valider un hébergement d'assets adapté (Git LFS selon quota, stockage d'objets ou CDN) ainsi que son budget. Ne pas activer un service facturable sans accord. Tant que la copie des médias n'est pas confirmée sur le serveur, ne pas marquer les GIF comme publiés et ne supprimer aucune source locale.

## Tests nécessaires avant fusion et production

- `pnpm test:run -- src/fx/animationLibrary.test.ts`
- `pnpm run check`
- `pnpm build`
- Ouvrir `/animation-library`, filtrer par tags et par pièce.
- Vérifier les cent règles du dictionnaire et les règles utilisateur en mode local.
- Vérifier les ressources réellement servies : 200, `Content-Type: image/gif`, 512 × 512, 48 images, transparence et boucle.
- Contrôler l'accessibilité mobile, les préférences de mouvement réduit, le chargement paresseux et l'absence d'URL arbitraire dans les règles.

## Fonctionnement en cas d'import incomplet

Sans `catalog.json` publié, l'application conserve les dix GIF existants dans `/rule-gifs` et les effets procéduraux. Une absence de média ne doit pas bloquer une partie ou valider une règle non supportée.
