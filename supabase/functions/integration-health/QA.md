# Manual QA: Integration Health Service Role Failure

1. Temporarily remove or blank out the `SUPABASE_SERVICE_ROLE_KEY` in the environment where the edge function runs (for local testing you can run `env -u SUPABASE_SERVICE_ROLE_KEY` before launching `supabase functions serve integration-health`).
2. Send a request to the endpoint, e.g. `curl -i "http://localhost:54321/functions/v1/integration-health"`.
3. Confirm the response status is `503 Service Unavailable` and the JSON body includes the `error` message and a `missing` array that lists the absent configuration keys instead of returning an unhandled exception.
