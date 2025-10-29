# Tunneliser un modèle OSS local avec ngrok

Ce guide explique comment exposer une instance locale (LM Studio, Ollama, etc.)
vers l'application Lovable via un tunnel HTTPS ngrok. Cette approche permet au
backend Supabase d'appeler votre modèle sans nécessiter de clé OpenAI tout en
conservant une URL sécurisée.

## 1. Pré-requis

- Une instance de modèle accessible en local (par défaut le projet attend
  `http://127.0.0.1:1234`).
- [ngrok](https://ngrok.com/download) installé et authentifié (`ngrok config add-authtoken <token>`).
- `pnpm` (ou l'outil que vous utilisez pour lancer votre modèle).

## 2. Lancer le modèle OSS

Assurez-vous que votre modèle sert des requêtes OpenAI compatibles sur
`http://127.0.0.1:1234/v1/chat/completions`. Exemple avec Ollama :

```bash
# Démarre Ollama si ce n'est pas déjà fait
ollama serve

# Expose le modèle autorisé par défaut
ollama run llama3.1:8b "Bonjour"
```

> ℹ️ Les modèles autorisés sont listés dans `OSS_MODEL_ALLOWLIST`
> (`supabase/functions/generate-chess-rule/index.ts`). Vous pouvez modifier
> `LOCAL_RULE_MODEL_NAME` pour en sélectionner un différent.

## 3. Créer le tunnel ngrok

Dans un autre terminal, exécutez :

```bash
ngrok http http://127.0.0.1:1234
```

ngrok affichera une URL publique du type
`https://<identifiant>.ngrok-free.app`. Cette adresse relaiera toutes les
requêtes entrantes vers votre service local.

## 4. Paramétrer l'application

Définissez les variables d'environnement utilisées par l'API Supabase pour
pointer vers votre tunnel :

```bash
export LOCAL_RULE_MODEL_URL="https://<identifiant>.ngrok-free.app/v1/chat/completions"
export LOCAL_RULE_MODEL_NAME="openai/gpt-oss-20b" # ou le modèle OSS de votre choix
export LOCAL_RULE_MODEL_API_KEY="" # laissez vide si votre service n'en requiert pas
```

Les domaines `*.ngrok-free.app`, `*.ngrok.app` et `*.ngrok.io` sont désormais
acceptés par la fonction `generate-chess-rule`. Vous pouvez également utiliser
ces variables dans `supabase/functions/.env` avant de déployer.

## 5. Vérifier la connectivité

Relancez la fonction ou l'application front ; la sortie du journal doit indiquer
le nouvel endpoint :

```
[LLM Endpoint] https://<identifiant>.ngrok-free.app/v1/chat/completions
```

Si vous voyez `remote_endpoint_forbidden`, assurez-vous que l'URL appartient au
domaine ngrok ou qu'elle pointe vers `localhost/127.0.0.1`.

## 6. Sécurité & quotas

- Les tunnels ngrok sont publics : ne partagez pas l'URL et utilisez éventuellement
  une clé API côté modèle.
- Les sous-domaines gratuits expirent lorsque vous stoppez ngrok. Relancez la
  commande et mettez à jour `LOCAL_RULE_MODEL_URL` si nécessaire.

Vous avez désormais un pont sécurisé entre votre modèle local et l'application.
