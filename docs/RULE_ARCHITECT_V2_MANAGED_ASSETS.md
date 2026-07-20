# Rule Architect V2 — assets gérés et cinématiques sûres

## Objectif

Rule Architect V2 peut transformer une demande libre telle que « lorsqu'une
pièce est capturée, un dragon arrive et l'emporte » en deux éléments séparés :

1. une mécanique déterministe compilée par le catalogue fermé V2 ;
2. une cinématique décorative qui ne peut jamais modifier l'état autoritaire de
   la partie.

Le modèle ne reçoit jamais le droit d'écrire ou d'exécuter du JavaScript, du
HTML, du SVG, du SQL ou une URL arbitraire.

## Chaîne de confiance

1. Le prompt est normalisé, borné à 6 000 caractères et analysé avant l'appel au
   modèle. Les redéfinitions de rôle, demandes de secrets, pseudo-messages
   système, charges encodées, URI et cibles réseau privées sont rejetées ou
   retirées.
2. Une requête visuelle courte est dérivée du texte nettoyé. Le serveur ne suit
   aucune URL fournie par l'utilisateur.
3. La recherche utilise uniquement l'API Wikimedia Commons et le téléchargement
   uniquement le domaine exact `upload.wikimedia.org` sous
   `/wikipedia/commons/`. Les redirections sont refusées.
4. Seuls les fichiers du domaine public ou sous CC0 sont acceptés. Cette première
   version exclut volontairement les licences qui imposent une attribution dans
   l'interface.
5. Le candidat est modéré côté serveur avec `omni-moderation-latest`, en texte et
   en image. L'absence de clé, une erreur réseau, une réponse incomplète ou un
   contenu signalé désactive l'asset externe pour cette compilation.
6. Le serveur télécharge au maximum 5 Mio, vérifie les octets magiques, les
   dimensions réelles et l'absence d'animation. Seuls PNG, JPEG et WebP statiques
   de 64 à 4 096 pixels sont admis. SVG, HTML, scripts et formats actifs sont
   impossibles.
7. Le contenu est nommé par SHA-256 puis copié dans le bucket public
   `rule-assets/managed`. Le navigateur ne reçoit qu'un identifiant opaque de la
   forme `cinematic.<preset>.asset_<hash>.<extension>`.
8. Le client reconstruit exclusivement une URL publique du projet Supabase déjà
   configuré, exige l'origine Supabase exacte et refuse paramètres, fragments,
   traversées de chemin et autres hôtes.
9. Le moteur exécute un preset fermé (`carry`, `swoop` ou `burst`) avec un nombre
   de cinématiques simultanées borné. L'asset ne peut appeler aucune API et ne
   peut devenir une logique de jeu.

## Capture et exemple du dragon

Le signal `lifecycle.onMoveCommitted` est enrichi avec `targetPieceId` lorsque le
dernier coup contient une pièce capturée. Le blueprint généré utilise alors la
condition `ctx.hasTargetPiece` et lance `vfx.play` sur `$ctx.to`. Le dragon ne se
déclenche donc pas à chaque déplacement.

La cinématique place l'image gérée au-dessus de la case, matérialise brièvement
la pièce capturée, puis fait sortir les deux éléments du plateau. Le plateau et
le résultat du coup restent contrôlés par le moteur d'échecs.

## Variables serveur

La recherche externe est volontairement désactivée par défaut. Elle nécessite :

```text
RULE_ASSET_SEARCH_ENABLED=true
OPENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`OPENAI_API_KEY` et `SUPABASE_SERVICE_ROLE_KEY` restent exclusivement dans les
secrets des Edge Functions. Aucune de ces valeurs ne doit être préfixée par
`VITE_`.

## Déploiement

1. appliquer `20260720214500_rule_architect_managed_assets.sql` ;
2. déployer `compile-chess-rule` avec les fichiers `_shared` associés ;
3. activer `RULE_ASSET_SEARCH_ENABLED=true` d'abord en staging ;
4. compiler une règle de capture avec dragon et vérifier la ligne
   `public.rule_assets`, le fichier Storage et la cinématique ;
5. tester les rejets : URL utilisateur, faux bloc serveur, SVG, redirection,
   image signalée et réponse de modération indisponible ;
6. déployer le frontend après réussite de la CI et des smoke tests.

## Extension future

D'autres fournisseurs peuvent être ajoutés sous forme d'adaptateurs serveur,
mais chacun doit posséder sa propre liste d'hôtes, son analyse de licence et les
mêmes contrôles de contenu. Le catalogue de logique demeure fermé : ajouter une
nouvelle famille de règle exige un nouvel opérateur audité, jamais du code fourni
par le modèle ou l'utilisateur.
