import { createAgendaClient } from './agenda-client.js';

const topics = {
  experiencias: { label: 'Experiências', title: 'Experiências que fizeram parte da trajetória' },
  galeria: { label: 'Galeria', title: 'Registros reais' },
  videos: { label: 'Vídeos', title: 'Em movimento' },
};
const topicKeys = Object.keys(topics);
const viewer = document.getElementById('mediaViewer');
const viewerContent = document.getElementById('mediaViewerContent');
const viewerTitle = document.getElementById('mediaViewerTitle');
const viewerDescription = document.getElementById('mediaViewerDescription');
const viewerClose = document.getElementById('mediaViewerClose');
let client = null;

function mediaUrl(item) {
  if (item.storage_path) {
    return client.storage.from('portfolio-media').getPublicUrl(item.storage_path).data.publicUrl;
  }
  return item.asset_url || '';
}

function setStatus(node, message, state = '') {
  if (!node) return;
  node.textContent = message;
  node.dataset.state = state;
}

function openViewer(item) {
  viewerContent.replaceChildren();
  viewerTitle.textContent = item.title;
  viewerDescription.textContent = item.description || '';
  viewerDescription.hidden = !item.description;
  const src = mediaUrl(item);

  if (item.media_type === 'video') {
    const video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', item.title);
    viewerContent.append(video);
  } else {
    const image = document.createElement('img');
    image.src = src;
    image.alt = item.title;
    image.decoding = 'async';
    viewerContent.append(image);
  }

  viewer.showModal();
  viewerClose.focus();
}

function makeCard(item, topic, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `portfolio-card ${className}`.trim();
  button.setAttribute('aria-label', `Abrir ${item.media_type === 'video' ? 'vídeo' : 'imagem'}: ${item.title}`);
  const src = mediaUrl(item);

  if (item.media_type === 'video') {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-hidden', 'true');
    button.append(video);
    const play = document.createElement('span');
    play.className = 'portfolio-play-mark';
    play.setAttribute('aria-hidden', 'true');
    play.textContent = '▶';
    button.append(play);
  } else {
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    button.append(image);
  }

  const title = document.createElement('span');
  title.className = 'portfolio-card-title';
  title.textContent = item.title;
  button.append(title);
  button.addEventListener('click', () => openViewer(item));
  return button;
}

function renderCards(container, items, topic, className = '') {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.append(makeCard(item, topic, className)));
  container.replaceChildren(fragment);
}

async function loadPortfolio() {
  const homeGrids = [...document.querySelectorAll('[data-portfolio-preview]')];
  const fullGrid = document.getElementById('portfolioAllGrid');
  const statusNodes = [...document.querySelectorAll('[data-portfolio-status]')];
  const { client: agendaClient, error: clientError } = await createAgendaClient();
  client = agendaClient;

  if (!client) {
    homeGrids.forEach((grid) => grid.replaceChildren());
    setStatusNodes(statusNodes, clientError || 'Não foi possível carregar as mídias.', 'error');
    return;
  }

  const { data, error } = await client
    .from('portfolio_media')
    .select('id,topic,title,description,media_type,asset_url,storage_path,position,created_at')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    homeGrids.forEach((grid) => grid.replaceChildren());
    if (fullGrid) fullGrid.replaceChildren();
    setStatusNodes(statusNodes, 'Não foi possível carregar as mídias agora. Tente novamente mais tarde.', 'error');
    return;
  }

  const media = data || [];
  homeGrids.forEach((grid) => {
    const topic = grid.dataset.portfolioPreview;
    const items = media.filter((item) => item.topic === topic);
    const limit = Number(grid.dataset.limit) || 3;
    renderCards(grid, items.slice(0, limit), topic, grid.dataset.cardClass || '');
    const status = grid.parentElement.querySelector('[data-portfolio-status]');
    setStatus(status, items.length ? '' : `Ainda não há itens em ${topics[topic]?.label || 'este tópico'}.`);
  });

  if (fullGrid) {
    const queryTopic = new URLSearchParams(window.location.search).get('topic');
    const topic = topicKeys.includes(queryTopic) ? queryTopic : 'experiencias';
    const items = media.filter((item) => item.topic === topic);
    document.getElementById('portfolioAllTitle').textContent = topics[topic].title;
    document.getElementById('portfolioAllEyebrow').textContent = topics[topic].label;
    document.querySelectorAll('[data-topic-link]').forEach((link) => {
      if (link.dataset.topicLink === topic) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    renderCards(fullGrid, items, topic, 'portfolio-card--full');
    setStatusNodes(statusNodes, items.length ? `${items.length} ${items.length === 1 ? 'item disponível' : 'itens disponíveis'}.` : 'Ainda não há itens neste tópico.');
  }
}

function setStatusNodes(nodes, message, state = '') {
  nodes.forEach((node) => setStatus(node, message, state));
}

viewerClose?.addEventListener('click', () => viewer.close());
viewer?.addEventListener('click', (event) => {
  if (event.target === viewer) viewer.close();
});
viewer?.addEventListener('close', () => {
  viewerContent.replaceChildren();
  viewerDescription.textContent = '';
});

loadPortfolio();
