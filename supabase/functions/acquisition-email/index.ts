import { handleArtworkEmail } from './handler.ts'

Deno.serve((request) => handleArtworkEmail(request, {
  webhookSecret: Deno.env.get('ACQUISITION_WEBHOOK_SECRET'),
  resendApiKey: Deno.env.get('RESEND_API_KEY'),
  fromAddress: Deno.env.get('ARTMUSE_EMAIL_FROM'),
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  appUrl: Deno.env.get('ARTMUSE_APP_URL'),
}))
