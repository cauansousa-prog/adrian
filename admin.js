import { createAgendaClient } from './agenda-client.js';

const { client, error: clientError } = await createAgendaClient();
const loginPanel = document.getElementById('loginPanel');
const managementPanel = document.getElementById('managementPanel');
const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const adminStatus = document.getElementById('adminStatus');
const listStatus = document.getElementById('listStatus');
const blockForm = document.getElementById('blockForm');
const blockId = document.getElementById('blockId');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const startTime = document.getElementById('startTime');
const endTime = document.getElementById('endTime');
const allDay = document.getElementById('allDay');
const blockList = document.getElementById('blockList');
const saveBlockButton = document.getElementById('saveBlockButton');
const cancelEditButton = document.getElementById('cancelEditButton');
const signOutButton = document.getElementById('signOutButton');

function setMessage(element, message, state) {
  element.textContent = message;
  element.dataset.state = state || '';
}

function translateError(error) {
  if (error?.code === '23P01') return 'Esse horário se sobrepõe a outro compromisso. Ajuste o período e tente novamente.';
  if (error?.code === '23514') return 'Confira o intervalo e os horários informados.';
  if (error?.code === '23505') return 'Este bloqueio já existe.';
  if (error?.status === 401 || error?.status === 403 || error?.code === 'PGRST301') {
    return 'Sua sessão expirou ou não tem autorização. Entre novamente para continuar.';
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

function showSignedOut(message) {
  loginPanel.hidden = false;
  managementPanel.hidden = true;
  window.dispatchEvent(new CustomEvent('portfolio-admin-signed-out'));
  if (message) setMessage(loginStatus, message, 'error');
}

function showSignedIn() {
  loginPanel.hidden = true;
  managementPanel.hidden = false;
  window.dispatchEvent(new CustomEvent('portfolio-admin-ready'));
  setMessage(loginStatus, '', '');
}

function syncTimeInputs() {
  const disabled = allDay.checked;
  [startTime, endTime].forEach((input) => {
    input.disabled = disabled;
    input.required = !disabled;
  });
}

function resetBlockForm() {
  blockForm.reset();
  blockId.value = '';
  syncTimeInputs();
  saveBlockButton.textContent = 'Bloquear período';
  cancelEditButton.hidden = true;
}

function formatRange(block) {
  const start = new Date(`${block.start_date}T12:00:00`);
  const end = new Date(`${block.end_date}T12:00:00`);
  const format = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
  const startDateLabel = format.format(start);
  const endDateLabel = format.format(end);
  const timeLabel = block.start_time && block.end_time
    ? (block.start_date === block.end_date
      ? ` · ${block.start_time.slice(0, 5)} às ${block.end_time.slice(0, 5)}`
      : ` · ${block.start_time.slice(0, 5)} no primeiro dia até ${block.end_time.slice(0, 5)} no último`)
    : ' · dia todo';
  return block.start_date === block.end_date
    ? `${startDateLabel}${timeLabel}`
    : `${startDateLabel} a ${endDateLabel}${timeLabel}`;
}

function makeAction(label, className, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${className}`;
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}

async function loadBlocks() {
  setMessage(listStatus, 'Carregando bloqueios…', '');
  blockList.replaceChildren();
  const { data, error } = await client
    .from('availability_blocks')
    .select('id,start_date,end_date,start_time,end_time')
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true });

  if (error) {
    setMessage(listStatus, translateError(error), 'error');
    if (error.status === 401 || error.status === 403) showSignedOut('Sua sessão expirou. Entre novamente.');
    return;
  }

  if (!data?.length) {
    setMessage(listStatus, 'Ainda não há datas bloqueadas.', '');
    return;
  }

  setMessage(listStatus, `${data.length} ${data.length === 1 ? 'bloqueio cadastrado' : 'bloqueios cadastrados'}.`, '');
  data.forEach((block) => {
    const item = document.createElement('li');
    item.className = 'block-item';
    const dates = document.createElement('span');
    dates.className = 'block-dates';
    dates.textContent = formatRange(block);
    const actions = document.createElement('div');
    actions.className = 'block-actions';

    actions.append(
      makeAction('Editar', 'button-secondary', () => {
        blockId.value = block.id;
        startDate.value = block.start_date;
        endDate.value = block.end_date;
        startTime.value = block.start_time?.slice(0, 5) || '';
        endTime.value = block.end_time?.slice(0, 5) || '';
        allDay.checked = !block.start_time && !block.end_time;
        syncTimeInputs();
        saveBlockButton.textContent = 'Salvar alterações';
        cancelEditButton.hidden = false;
        setMessage(adminStatus, 'Edite as datas acima e salve as alterações.', '');
        startDate.focus();
      }),
      makeAction('Liberar', 'button-secondary', async () => {
        if (!window.confirm(`Liberar ${formatRange(block)}?`)) return;
        const { error: deleteError } = await client.from('availability_blocks').delete().eq('id', block.id);
        if (deleteError) {
          setMessage(adminStatus, translateError(deleteError), 'error');
          return;
        }
        resetBlockForm();
        setMessage(adminStatus, 'Data liberada. A agenda pública foi atualizada.', 'success');
        loadBlocks();
      }),
    );

    item.append(dates, actions);
    blockList.append(item);
  });
}

async function verifyAdministrator(user) {
  if (!user || !client) return false;
  const { data, error } = await client
    .from('availability_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    await client.auth.signOut();
    showSignedOut('Não foi possível confirmar a autorização. Confira a conexão e se a migração da agenda foi aplicada.');
    return false;
  }

  if (!data) {
    await client.auth.signOut();
    showSignedOut('Esta conta não está autorizada a administrar a agenda.');
    return false;
  }

  showSignedIn();
  await loadBlocks();
  return true;
}

if (!client) {
  loginForm.querySelector('button[type="submit"]').disabled = true;
  setMessage(loginStatus, clientError || 'A conexão com o calendário ainda não está configurada.', 'error');
} else {
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) showSignedOut('');
  });

  client.auth.getUser().then(({ data, error }) => {
    if (!error && data.user) verifyAdministrator(data.user);
  });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) return;
  setMessage(loginStatus, 'Verificando acesso…', '');
  const { data, error } = await client.auth.signInWithPassword({
    email: loginForm.email.value.trim(),
    password: loginForm.password.value,
  });
  if (error) {
    setMessage(loginStatus, 'Não foi possível entrar. Confira os dados e tente novamente.', 'error');
    return;
  }
  await verifyAdministrator(data.user);
});

blockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) return;
  const start = startDate.value;
  const end = endDate.value;
  const startHour = startTime.value;
  const endHour = endTime.value;
  if (!start || !end || end < start) {
    setMessage(adminStatus, 'Informe um intervalo válido: a data final não pode vir antes da inicial.', 'error');
    return;
  }
  if (!allDay.checked && (!startHour || !endHour || (start === end && endHour <= startHour))) {
    setMessage(adminStatus, 'Informe os dois horários. No mesmo dia, o horário final deve ser posterior ao inicial.', 'error');
    return;
  }

  saveBlockButton.disabled = true;
  setMessage(adminStatus, 'Salvando…', '');
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    saveBlockButton.disabled = false;
    showSignedOut('Sua sessão expirou. Entre novamente para continuar.');
    return;
  }

  const values = {
    start_date: start,
    end_date: end,
    start_time: allDay.checked ? null : startHour,
    end_time: allDay.checked ? null : endHour,
  };
  const request = blockId.value
    ? client.from('availability_blocks').update(values).eq('id', blockId.value).select('id').maybeSingle()
    : client.from('availability_blocks').insert({ ...values, created_by: userData.user.id }).select('id').single();
  const { data, error } = await request;
  saveBlockButton.disabled = false;

  if (error || !data) {
    setMessage(adminStatus, translateError(error), 'error');
    if (error?.status === 401 || error?.status === 403) showSignedOut('Sua sessão expirou ou não tem autorização. Entre novamente.');
    return;
  }

  resetBlockForm();
  setMessage(adminStatus, 'Período salvo. A agenda pública foi atualizada.', 'success');
  await loadBlocks();
});

allDay.addEventListener('change', syncTimeInputs);
startDate.addEventListener('change', () => {
  endDate.min = startDate.value;
  if (endDate.value && endDate.value < startDate.value) endDate.value = startDate.value;
});
endDate.addEventListener('change', () => {
  if (startDate.value) endDate.min = startDate.value;
});

syncTimeInputs();

cancelEditButton.addEventListener('click', () => {
  resetBlockForm();
  setMessage(adminStatus, 'Edição cancelada.', '');
});

signOutButton.addEventListener('click', async () => {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) setMessage(adminStatus, 'Não foi possível encerrar a sessão. Tente novamente.', 'error');
  else showSignedOut('Você saiu da área administrativa.');
});

document.getElementById('refreshBlocksButton').addEventListener('click', loadBlocks);

