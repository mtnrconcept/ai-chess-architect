# Déploiement des fonctions Supabase Edge

Les fonctions Rule Architect V2 et le validateur de coups STANDARD ne sont
jamais déployés automatiquement sur un `push`. Utiliser le workflow GitHub
manuel, son environnement protégé et l'allowlist explicite des quatre fonctions
V2 plus `process-chess-move`.

La migration du même SHA doit avoir été appliquée et validée avant le
déploiement Edge. Une référence projet codée en dur, un lien CLI local ancien ou
un projet simplement accessible ne sont pas des preuves de cible.

Le processus complet, les secrets, la validation staging et la procédure
production sont décrits dans
[RULE_ARCHITECT_V2_DEPLOYMENT.md](./RULE_ARCHITECT_V2_DEPLOYMENT.md).
