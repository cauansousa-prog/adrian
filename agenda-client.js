import { supabaseUrl, supabasePublishableKey } from './supabase-config.js';

export async function createAgendaClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    return { client: null, error: 'A conexão com o calendário ainda não está configurada.' };
  }

  let createClient;
  try {
    ({ createClient } = await import('https://esm.sh/@supabase/supabase-js@2.118.0'));
  } catch {
    return { client: null, error: 'Não foi possível carregar o serviço da agenda. Verifique sua conexão e tente novamente.' };
  }

  return { client: createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  }), error: null };
}


