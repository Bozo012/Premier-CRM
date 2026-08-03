-- Update the Demo organization's visible display name from "Premier CRM
-- Demonstration" to "Forge Demonstration" — approved by Kevin as part of
-- the Forge/Foundry naming rollout (see
-- docs/architecture/forge-foundry-naming-audit.md §5 and §7 item 1).
--
-- Scoped to the exact org ID, not a text-pattern match, so this can never
-- accidentally touch another organization (in particular, never Premier
-- Property Maintenance, which is not renamed). The `name =` guard makes
-- this idempotent: rerunning it is a no-op once the name has already been
-- changed, and it is a no-op (0 rows) in any environment where this exact
-- org/name combination doesn't exist.
--
-- Explicitly preserved, untouched by this migration: organization id
-- (a0c9b59d-77d9-48ad-9760-8555c9ed8fe5), slug (premier-crm-demonstration —
-- treated as a stable technical identifier, not renamed during Forge V1),
-- timezone, memberships, customer accounts, properties, workflow records,
-- invoices/payments, Storage paths, and all historical audit records.
update public.organizations
set name = 'Forge Demonstration'
where id = 'a0c9b59d-77d9-48ad-9760-8555c9ed8fe5'
  and name = 'Premier CRM Demonstration';
