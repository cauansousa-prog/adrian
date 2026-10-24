import { createAgendaClient } from './agenda-client.js';

const { client } = await createAgendaClient();
const form = document.getElementById('portfolioMediaForm');
if (!form) throw new Error('O formulário de mídias do painel não foi encontrado.');

const idInput = document.getElementById('portfolioMediaId');
const topicInput = document.getElementById('portfolioTopic');
const titleInput = document.getElementById('portfolioTitle');
const descriptionInput = document.getElementById('portfolioDescription');
const fileInput = document.getElementById('portfolioFile');
const fileField = document.getElementById('portfolioFileField');
const saveButton = document.getElementById('savePortfolioMediaButton');
const cancelEditButton = document.getElementById('cancelPortfolioEditButton');
const status = document.getElementById('portfolioMediaStatus');
const listStatus = document.getElementById('portfolioMediaListStatus');
const list = document.getElementById('portfolioMediaList');
const topicFilter = document.getElementById('portfolioTopicFilter');
const maxFileBytes = 50 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const allowedVideoTypes = new Set(['video/mp4', 'video/webm']);
const topicNames = { experiencias: 'Experiências', galeria: 'Galeria', videos: 'Vídeos' };
let mediaItems = [];

function message(node, text, state = '') {
  node.textContent = text;
  node.dataset.state = state;
}

function publicUrl(item) {
  if (item.storage_path && client) {
    return client.storage.from('portfolio-media').getPublicUrl(item.storage_path).data.publicUrl;
  }
  return item.asset_url || '';
}

async function ensureAdministrator() {
  if (!client) return null;
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return null;
  const { data, error } = await client.from('availability_admins')
    .select('user_id').eq('user_id', userData.user.id).maybeSingle();
  return error || !data ? null : userData.user;
}

function resetForm() {
  form.reset();
  idInput.value = '';
  topicInput.disabled = false;
  fileInput.required = true;
  fileInput.disabled = false;
  fileField.hidden = false;
  saveButton.textContent = 'Adicionar mídia';
  cancelEditButton.hidden = true;
}

function createButton(label, callback, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button ${danger ? 'button-danger' : 'button-secondary'}`;
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}

function renderList() {
  const visibleItems = topicFilter.value === 'all'
    ? mediaItems
    : mediaItems.filter((item) => item.topic === topicFilter.value);
  const fragment = document.createDocumentFragment();

  visibleItems.forEach((item) => {
    const row = document.createElement('li');
    row.className = 'media-item';
    const preview = document.createElement(item.media_type === 'video' ? 'video' : 'img');
    preview.className = 'media-preview';
    preview.src = publicUrl(item);
    if (item.media_type === 'video') {
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      preview.setAttribute('aria-label', `Prévia do vídeo ${item.title}`);
    } else {
      preview.alt = '';
      preview.loading = 'lazy';
    }

    const details = document.createElement('div');
    details.className = 'media-item-details';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const topic = document.createElement('span');
    topic.textContent = `${topicNames[item.topic]} · ${item.media_type === 'video' ? 'Vídeo' : 'Imagem'}`;
    const description = document.createElement('p');
    description.textContent = item.description || 'Sem descrição';
    details.append(title, topic, description);

    const actions = document.createElement('div');
    actions.className = 'media-item-actions';
    actions.append(
      createButton('Editar texto', () => {
        idInput.value = item.id;
        topicInput.value = item.topic;
        topicInput.disabled = true;
        titleInput.value = item.title;
        descriptionInput.value = item.description || '';
        fileInput.value = '';
        fileInput.required = false;
        fileInput.disabled = true;
        fileField.hidden = true;
        saveButton.textContent = 'Salvar descrição';
        cancelEditButton.hidden = false;
        message(status, 'Edite o título ou a descrição. A descrição só aparece quando a mídia é aberta.');
        titleInput.focus();
      }),
      createButton('Remover', async () => {
        if (!window.confirm(`Remover “${item.title}” de ${topicNames[item.topic]}?`)) return;
        await removeItem(item);
      }, true),
    );

    row.append(preview, details, actions);
    fragment.append(row);
  });

  list.replaceChildren(fragment);
  message(listStatus, `${visibleItems.length} ${visibleItems.length === 1 ? 'mídia exibida' : 'mídias exibidas'}.`);
}

async function loadMedia() {
  if (!client) {
    message(listStatus, 'Não foi possível conectar ao banco de mídias.', 'error');
    return;
  }
  message(listStatus, 'Carregando mídias…');
  const user = await ensureAdministrator();
  if (!user) {
    list.replaceChildren();
    message(listStatus, 'Entre com a conta autorizada para gerenciar as mídias.', 'error');
    return;
  }

  const { data, error } = await client.from('portfolio_media')
    .select('id,topic,title,description,media_type,asset_url,storage_path,position,created_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    mediaItems = [];
    list.replaceChildren();
    message(listStatus, 'Não foi possível carregar as mídias. Confira se a migração do portfólio foi aplicada.', 'error');
    return;
  }
  mediaItems = data || [];
  renderList();
}

async function removeItem(item) {
  const user = await ensureAdministrator();
  if (!user) {
    message(status, 'Sua sessão expirou ou não está autorizada. Entre novamente.', 'error');
    return;
  }

  message(status, 'Removendo mídia…');
  const { error } = await client.from('portfolio_media').delete().eq('id', item.id);
  if (error) {
    message(status, 'Não foi possível remover a mídia. Tente novamente.', 'error');
    return;
  }

  let storageNotice = '';
  if (item.storage_path) {
    const { error: storageError } = await client.storage.from('portfolio-media').remove([item.storage_path]);
    if (storageError) storageNotice = ' O arquivo saiu do portfólio, mas não pôde ser apagado do armazenamento; tente novamente depois.';
  }
  message(status, `Mídia removida do portfólio.${storageNotice}`, storageNotice ? 'error' : 'success');
  await loadMedia();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) {
    message(status, 'Não foi possível conectar ao Supabase.', 'error');
    return;
  }
  const user = await ensureAdministrator();
  if (!user) {
    message(status, 'Sua sessão expirou ou não está autorizada. Entre novamente.', 'error');
    return;
  }

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  if (!title) {
    message(status, 'Informe um título para esta mídia.', 'error');
    titleInput.focus();
    return;
  }

  saveButton.disabled = true;
  if (idInput.value) {
    const { error } = await client.from('portfolio_media').update({ title, description }).eq('id', idInput.value);
    saveButton.disabled = false;
    if (error) {
      message(status, 'Não foi possível salvar o título ou a descrição.', 'error');
      return;
    }
    resetForm();
    message(status, 'Texto da mídia atualizado.', 'success');
    await loadMedia();
    return;
  }

  const file = fileInput.files?.[0];
  if (!file) {
    saveButton.disabled = false;
    message(status, 'Escolha uma imagem ou vídeo para adicionar.', 'error');
    return;
  }
  if (file.size > maxFileBytes) {
    saveButton.disabled = false;
    message(status, 'O arquivo ultrapassa o limite de 50 MB.', 'error');
    return;
  }

  const isImage = allowedImageTypes.has(file.type);
  const isVideo = allowedVideoTypes.has(file.type);
  const topic = topicInput.value;
  if ((!isImage && !isVideo) || (topic !== 'videos' && !isImage)) {
    saveButton.disabled = false;
    message(status, topic === 'videos'
      ? 'Use uma imagem ou vídeo MP4/WebM neste tópico.'
      : 'Experiências e Galeria aceitam imagens. Envie vídeos no tópico Vídeos.', 'error');
    return;
  }

  const mediaType = isVideo ? 'video' : 'image';
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (isVideo ? 'mp4' : 'jpg');
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  message(status, 'Enviando arquivo…');
  const { error: uploadError } = await client.storage.from('portfolio-media').upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    saveButton.disabled = false;
    message(status, 'Não foi possível enviar o arquivo. Tente novamente.', 'error');
    return;
  }

  const { error: insertError } = await client.from('portfolio_media').insert({
    topic,
    title,
    description,
    media_type: mediaType,
    storage_path: storagePath,
    position: Math.max(0, ...mediaItems.filter((item) => item.topic === topic).map((item) => item.position)) + 10,
  });
  if (insertError) {
    await client.storage.from('portfolio-media').remove([storagePath]);
    saveButton.disabled = false;
    message(status, 'O arquivo foi enviado, mas não foi possível cadastrar a mídia. Tente novamente.', 'error');
    return;
  }

  saveButton.disabled = false;
  resetForm();
  message(status, 'Mídia adicionada ao portfólio.', 'success');
  await loadMedia();
});

topicFilter.addEventListener('change', renderList);
document.getElementById('refreshMediaButton').addEventListener('click', loadMedia);
cancelEditButton.addEventListener('click', () => {
  resetForm();
  message(status, 'Edição cancelada.');
});
window.addEventListener('portfolio-admin-ready', loadMedia);
window.addEventListener('portfolio-admin-signed-out', () => {
  mediaItems = [];
  list.replaceChildren();
  message(listStatus, 'Entre com a conta autorizada para gerenciar as mídias.');
});

ensureAdministrator().then((user) => {
  if (user) loadMedia();
});
