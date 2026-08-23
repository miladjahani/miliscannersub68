/*
  Deployment metadata for the multi-source Cloudflare deployment pipeline.
  Stores the selected worker source, binding mode, resource IDs and method
  so the dashboard can audit and resume deployment workflows safely.
*/
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS worker_source text,
  ADD COLUMN IF NOT EXISTS deployment_config jsonb NOT NULL DEFAULT '{}'::jsonb;
