// Copy these two PUBLIC browser settings from your LIVE Sim Wrestling config.
// Never use a secret key, database password, or legacy service_role key here.
window.POST_CONFIG = Object.freeze({
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabasePublishableKey: 'YOUR-SUPABASE-PUBLISHABLE-KEY',
  schema: 'public_simwrestlingpost',
  mainSiteUrl: 'https://simwrestling.com',
  refreshIntervalMs: 60000
});
