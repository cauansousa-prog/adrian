import { createAgendaClient } from './agenda-client.js';

const form = document.getElementById('recoveryForm');
const status = document.getElementById('recoveryStatus');
const button = form.querySelector('button[type="submit"]');
const { client, error: clientError } = await createAgendaClient();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) {
    status.textContent = clientError || 'Serviço temporariamente indisponível. Tente novamente.';
    status.dataset.state = 'error';
    return;
  }

  button.disabled = true;
  status.textContent = 'Enviando solicitação…';
  status.dataset.state = '';
  const { error } = await client.auth.resetPasswordForEmail(form.email.value.trim(), {
    redirectTo: `${window.location.origin}/redefinir-senha.html`,
  });
  button.disabled = false;

  if (error) {
    status.textContent = 'Não foi possível enviar o link agora. Confira sua conexão e tente novamente.';
    status.dataset.state = 'error';
    return;
  }

  status.textContent = 'Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também o spam.';
  status.dataset.state = 'success';
});

