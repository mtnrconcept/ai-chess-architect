# Déploiement des fonctions Supabase Edge

Les fonctions Rule Architect V2 ne sont jamais déployées automatiquement sur un
`push`. Utiliser le workflow GitHub manuel, son environnement protégé et les
quatre fonctions explicitement autorisées.

La migration du même SHA doit avoir été appliquée et validée avant le
déploiement Edge. Une référence projet codée en dur, un lien CLI local ancien ou
un projet simplement accessible ne sont pas des preuves de cible.

Le processus complet, les secrets, la validation staging et la procédure
production sont décrits dans
[RULE_ARCHITECT_V2_DEPLOYMENT.md](./RULE_ARCHITECT_V2_DEPLOYMENT.md).
