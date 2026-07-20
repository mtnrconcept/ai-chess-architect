# Rule Asset Pipeline

## Objectif

Rule Architect peut désormais exprimer une animation personnalisée avec l'effet
fermé `vfx.play` et un identifiant déclaratif `scene.<slug>`. Exemple :

```text
scene.dragon-carry-capture
```

Le slug décrit l'intention visuelle. Il n'est jamais interprété comme une URL,
un chemin, du code ou une instruction. Le moteur mécanique reste autoritaire et
la scène reste décorative : une capture doit toujours contenir l'effet
`piece.capture` distinct.

## Flux de confiance

1. Le modèle retourne un `RuleBlueprintV2` sous Structured Outputs.
2. Le compilateur existant valide le catalogue fermé et compile `vfx.play`.
3. Le client détecte uniquement les sprites qui correspondent à
   `^scene\.[a-z0-9][a-z0-9.-]{2,63}$`.
4. `resolve-rule-assets` recharge la compilation depuis la base avec le
   service-role et vérifie que l'utilisateur en est propriétaire.
5. La fonction extrait au maximum quatre scènes depuis la projection compilée.
6. Une requête Openverse est construite uniquement à partir du slug validé.
7. Les métadonnées Openverse sont filtrées de façon déterministe, sans être
   renvoyées au modèle.
8. Le média est téléchargé par le proxy Openverse avec redirections désactivées.
9. Le type MIME, la taille, la licence et les dimensions sont contrôlés.
10. Le fichier est haché en SHA-256 et copié dans le bucket privé `rule-assets`.
11. Le navigateur reçoit seulement une URL Supabase signée à durée limitée.
12. Pixi/GSAP anime le média. En cas d'échec, un acteur procédural local est
    utilisé sans affecter le coup, l'horloge ou la synchronisation réseau.

## Garde-fous actifs

### Prompt et sortie du modèle

- Aucun code JavaScript, HTML, SQL ou appel réseau généré.
- Aucun domaine, chemin ou URL dans un identifiant de scène.
- Une scène maximum par trigger et quatre scènes uniques par règle.
- La scène ne peut pas remplacer un effet mécanique.
- Le contenu d'un fournisseur externe n'entre jamais dans le contexte du LLM.

### Réseau

- Fournisseur initial fermé : `api.openverse.org`.
- HTTPS uniquement.
- Redirections HTTP refusées.
- Requête dérivée du slug, jamais du texte brut de l'utilisateur.
- Délai réseau borné entre 1 et 15 secondes.
- Réponse JSON plafonnée à 512 000 caractères.
- Téléchargement effectué par l'endpoint thumbnail Openverse, pas par une URL
  arbitraire retournée par une source indexée.

### Fichiers

- Formats autorisés : PNG, WebP et JPEG.
- SVG, HTML, scripts, archives, modèles exécutables et formats actifs refusés.
- Taille maximale : 4 Mio.
- Empreinte SHA-256 et chemin de stockage fondé sur le contenu.
- Bucket Supabase privé, sans policy directe pour `anon` ou `authenticated`.
- URL signée par l'Edge Function uniquement.

### Licences

La première version accepte uniquement :

- CC0 ;
- Public Domain Mark ;
- CC BY.

Les licences NC, ND et BY-SA ne sont pas sélectionnées automatiquement. Le nom
du créateur, l'attribution, la licence et la page Openverse sont conservés dans
la table `rule_scene_assets`. Le rendu affiche une ligne de crédit lorsque les
métadonnées l'exigent.

## Repli procédural

Le média externe n'est jamais une dépendance de gameplay. Quand la recherche,
le téléchargement, le stockage, la signature ou le chargement Pixi échoue, le
client produit un acteur local. Pour un slug contenant `dragon`, il dessine un
dragon procédural qui arrive sur la case, saisit un jeton représentant la pièce
et repart. Les autres slugs utilisent un acteur générique animé.

## Tables et stockage

Migration : `20260720203000_rule_scene_assets.sql`.

- `rule_scene_assets` : cache global par identifiant de scène, métadonnées de
  licence, hash, statut et chemin privé.
- `rule_compilation_scene_assets` : liaison entre compilation et assets.
- bucket `rule-assets` : privé, 4 Mio maximum, MIME raster uniquement.

Les tables ont RLS activé et ne donnent aucun droit direct aux rôles navigateur.
Le service-role est utilisé exclusivement dans `resolve-rule-assets`.

## Déploiement

Ordre obligatoire :

1. appliquer la migration sur staging ;
2. confirmer le projet Supabase ciblé ;
3. déployer le commit exact avec le workflow protégé
   `deploy-edge-functions.yml` ;
4. vérifier `resolve-rule-assets` avec `verify_jwt=true` ;
5. générer une règle contenant `scene.dragon-carry-capture` ;
6. contrôler la ligne `rule_scene_assets`, l'objet privé et le rendu ;
7. répéter avec Openverse indisponible pour valider le repli procédural ;
8. déployer en production depuis `main` seulement.

Secrets Edge optionnels :

```text
OPENVERSE_API_TOKEN
RULE_ASSET_FETCH_TIMEOUT_MS=7000
RULE_ASSET_SIGNED_URL_SECONDS=3600
```

L'API Openverse peut fonctionner sans token avec des limites anonymes. Un token
améliore uniquement les quotas et ne doit jamais être préfixé par `VITE_`.

## Vérifications automatisées

- tests Deno de l'extraction, de la requête et du filtrage Openverse ;
- tests Vitest de l'appel automatique après compilation ;
- `deno check` de l'Edge Function ;
- `verify-rule-assets-security.mjs` pour les invariants réseau, stockage, MIME,
  licence, JWT et prompt ;
- type-check frontend et build de production.

## Extensions prévues

Les extensions suivantes doivent rester des adaptateurs séparés :

- audio : durée, codec, volume, normalisation et licence propres ;
- modèles GLB/glTF : taille décompressée, textures, nombre de triangles,
  animations, matériaux et budget GPU ;
- vidéos : codecs, durée, résolution, décodage et autoplay ;
- fournisseurs sous OAuth ou contrat : activation explicite, jetons côté serveur
  et conservation des obligations de licence.

Aucun de ces adaptateurs ne devra permettre au modèle de choisir directement une
URL, d'exécuter un script ou de modifier l'état autoritaire de la partie.
