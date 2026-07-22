# Rule Architect V2

## Frontière de confiance

Le modèle ne produit jamais de JavaScript, SQL, HTML ou objet moteur libre. Il
remplit un blueprint conforme à un schéma JSON strict. Le serveur valide ce
blueprint contre un catalogue fermé, le compile de façon déterministe et refuse
toute condition, tout effet, provider ou paramètre inconnu.

La chaîne de traitement est la suivante :

```text
prompt joueur
  -> décomposition en exigences et clarifications
  -> contrat signé par le serveur et lié au compte
  -> accord explicite sur les adaptations
  -> Structured Output du blueprint
  -> validation structurelle et métier
  -> compilation DSL
  -> audit indépendant de couverture avec preuves dans la logique
  -> diagnostics et score d'équilibrage
  -> confirmation joueur
  -> version immuable
  -> lobby verrouillé par hash et seed partagé
```

Le navigateur n'obtient jamais `OPENAI_API_KEY`, une clé Supabase
`service_role` ou une clé `sb_secret_…`. Il peut demander le mode premium, mais
seul le serveur l'accorde à partir de métadonnées ou d'une liste d'UUID de
confiance.

Le navigateur ne fait pas autorité sur la liste des exigences. Le serveur signe
le questionnaire pour une heure, vérifie son propriétaire et reconstruit lui-même
le prompt de compilation à partir des choix autorisés. Toute modification,
omission, réponse inconnue ou incertitude restante est refusée avant l’appel au
modèle.

## Cycle de vie

### Compilation privée

Une tentative possède une clé UUID d'idempotence. Les doubles clics et retries
réseau réutilisent cette clé. Le prompt, le blueprint et le résultat compilé
restent privés. Une compilation expire après sept jours et sa politique RLS
cesse de la rendre lisible à l'expiration.

Le serveur recalcule la couverture de chaque exigence et de chaque réponse de
clarification. Une description ou un exemple ne prouve pas une mécanique : la
preuve doit pointer vers une action, une condition ou un effet compilé. Toute
exigence oubliée, non prise en charge ou adaptée autrement que l’ajustement
accepté place la compilation en statut `rejected`, ce qui empêche sa publication.
Un trigger de base de données vérifie à nouveau la complétude du contrat lors de
l’insertion de la version immuable.

La fonction `public.cleanup_expired_rule_compilations()` supprime les
compilations expirées non publiées. Son existence ne suffit pas : un cron
quotidien doit être configuré et surveillé dans chaque environnement Supabase.

### Version publiée

`publish_rule_compilation_v2` crée une version immuable et une ligne de
compatibilité dans `chess_rules`. Le prompt original est expurgé après
publication. Deux publications identiques par le même propriétaire sont
dédupliquées et un retry renvoie la version déjà créée.

### Lobby

`create_rule_lobby_v2` verrouille les UUID des versions, les identifiants de
compatibilité, l'empreinte du ruleset et la version moteur. La création possède
elle aussi une clé UUID d'idempotence.

- mode IA : le seed est généré à la création ;
- mode joueur : le seed reste `null` pendant l'attente et est généré
  atomiquement quand l'adversaire rejoint le lobby.

Les deux participants matched reçoivent ensuite le même `ruleset_hash`, la même
version moteur et le même `match_seed`.

## Déterminisme et limites

Une même suite d'événements, avec les mêmes versions et le même seed, doit
produire le même résultat. Toute source d'aléatoire passe par le générateur
déterministe du moteur. Les identifiants dérivés sont également déterministes.

Le DSL V2 exclut les opérations récursives non bornées et les effets de zone
historiques risqués. Les budgets de profondeur et d'effets sont contrôlés avant
et pendant l'exécution.

Le ruleset et le seed multijoueur sont déterministes, mais la boucle de coups
historique n'est pas encore entièrement arbitrée par le serveur. Les parties
classées doivent rester désactivées jusqu'à ce que chaque coup, horloge et
résultat soit validé et journalisé transactionnellement côté serveur.

## Observabilité sans secret

Une compilation peut enregistrer le modèle réellement utilisé, l'identifiant
de réponse OpenAI, le hash du prompt, la durée, les diagnostics, les scores et
l'usage de tokens. Ne jamais journaliser le prompt complet, l'en-tête
`Authorization`, une clé API, un JWT ou le contenu d'une variable secrète.

Voir aussi :

- [runbook de déploiement](./RULE_ARCHITECT_V2_DEPLOYMENT.md) ;
- [politique des modèles](./RULE_ARCHITECT_V2_MODEL_POLICY.md) ;
- [procédure de retour arrière](./RULE_ARCHITECT_V2_ROLLBACK.md).
