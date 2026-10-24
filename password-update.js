import { createAgendaClient } from './agenda-client.js';

const form = document.getElementById('passwordForm');
const password = document.getElementById('newPassword');
const confirmation = document.getElementById('confirmPassword');
const status = document.getElementById('passwordStatus');
const button = form.querySelector('button[type="submit"]');
const { client, error: clientError } = await createAgendaClient();

function showStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

if (!client) {
  showStatus(clientError || 'Não foi possível validar o link. Solicite outro link de redefinição.', 'error');
} else {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    showStatus('Este link expirou ou já foi utilizado. Solicite uma nova redefinição de senha.', 'error');
  } else {
    form.hidden = false;
    showStatus('Link validado. Escolha sua nova senha.');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) return;
  if (password.value !== confirmation.value) {
    showStatus('As senhas não coincidem.', 'error');
    confirmation.focus();
    return;
  }

  button.disabled = true;
  showStatus('Atualizando senha…');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) {
    button.disabled = false;
    form.hidden = true;
    showStatus('A sessão de recuperação expirou. Solicite um novo link.', 'error');
    return;
  }

  const { error } = await client.auth.updateUser({ password: password.value });
  button.disabled = false;
  if (error) {
    showStatus('Não foi possível atualizar a senha. Tente novamente com uma senha válida.', 'error');
    return;
  }

  await client.auth.signOut();
  form.hidden = true;
  showStatus('Senha atualizada. Acesse a área administrativa usando a nova senha.', 'success');
});

