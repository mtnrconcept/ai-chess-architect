# Supabase Connectivity Troubleshooting

This document captures connectivity failures encountered when running Supabase-related commands in the development environment and the steps used to diagnose them.

## Observed symptoms

- `nslookup db.ucaqbhmyutlnitnedowk.supabase.co` returns `NXDOMAIN`.
- `npm run db:migrate` fails because the Supabase database hostname cannot be resolved.
- `npx supabase --version` succeeds, confirming the CLI is installed, but other commands cannot run due to missing network connectivity.

## Investigation checklist

1. **Validate local DNS resolution**
   - Run `nslookup <project-ref>.supabase.co` to confirm the hostname resolves to an IP address.
   - If the command returns `NXDOMAIN`, the environment cannot reach Supabase's DNS records. This is often caused by restrictive network policies or missing outbound connectivity.

2. **Confirm CLI availability**
   - Execute `npx supabase --version` to ensure the Supabase CLI is installed. A valid version output indicates the binary is available locally, so connectivity is the primary blocker.

3. **Retry the migration**
   - After DNS connectivity is restored, rerun `npm run db:migrate` to verify that migrations can reach the database.

## Recommended mitigations

- Ensure the environment allows outbound DNS queries. If you are running inside a restricted container, request network access or run the command from a host with proper DNS resolution.
- Verify that the Supabase project reference (`ucaqbhmyutlnitnedowk`) is correct. A typo in the project ref will produce an `NXDOMAIN` error.
- If issues persist, consult Supabase status pages or try resolving a known hostname such as `supabase.co` to determine whether the failure is limited to the project subdomain.

## Next steps

Once DNS resolution succeeds:

- Re-run `npm run db:migrate` to apply outstanding migrations.
- Execute other Supabase CLI commands (e.g., `supabase db remote commit`) to confirm full connectivity.

Documenting these steps should streamline future investigations when network-related deployment issues arise.
