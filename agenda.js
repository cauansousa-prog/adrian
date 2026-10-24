import { createAgendaClient } from './agenda-client.js';

const { client, error: clientError } = await createAgendaClient();
const daysElement = document.getElementById('calendarDays');
const monthElement = document.getElementById('calendarMonth');
const statusElement = document.getElementById('calendarStatus');
const previousButton = document.getElementById('calendarPrevious');
const nextButton = document.getElementById('calendarNext');
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' });

let visibleMonth;
let currentState = 'loading';
let busyRanges = [];
let requestSequence = 0;

function fortalezaTodayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function setStatus(message, state) {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function isBusy(key) {
  return busyRanges.some((range) => range.start_date <= key && range.end_date >= key);
}

function renderCalendar() {
  monthElement.textContent = monthFormatter.format(visibleMonth);
  daysElement.replaceChildren();

  const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - mondayOffset);
  const todayKey = fortalezaTodayKey();

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const key = dateKey(day);
    const button = document.createElement('button');
    const sameMonth = day.getMonth() === visibleMonth.getMonth();
    const busy = currentState === 'loaded' && isBusy(key);
    const status = currentState !== 'loaded' ? 'disponibilidade não consultada' : (busy ? 'ocupado' : 'disponível');

    button.type = 'button';
    button.className = 'calendar-day';
    button.textContent = String(day.getDate());
    button.setAttribute('aria-label', `${dateFormatter.format(day)}: ${status}`);
    button.disabled = currentState !== 'loaded';

    if (!sameMonth) button.classList.add('outside-month');
    if (currentState !== 'loaded') button.classList.add('is-unknown');
    else button.classList.add(busy ? 'is-busy' : 'is-free');
    if (key === todayKey) {
      button.classList.add('is-today');
      button.setAttribute('aria-current', 'date');
    }

    daysElement.appendChild(button);
  }

  previousButton.disabled = currentState === 'loading';
  nextButton.disabled = currentState === 'loading';
}

async function loadAvailability() {
  const sequence = ++requestSequence;
  currentState = 'loading';
  busyRanges = [];
  setStatus('Consultando disponibilidade…', 'loading');
  renderCalendar();

  if (!client) {
    currentState = 'error';
    setStatus(clientError || 'Não foi possível consultar a agenda.', 'error');
    renderCalendar();
    return;
  }

  const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const lastOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const startKey = dateKey(firstOfMonth);
  const endKey = dateKey(lastOfMonth);
  const { data, error } = await client
    .from('availability_blocks')
    .select('start_date,end_date')
    .lte('start_date', endKey)
    .gte('end_date', startKey);

  if (sequence !== requestSequence) return;

  if (error) {
    currentState = 'error';
    setStatus('Não foi possível consultar a disponibilidade agora. Tente novamente em instantes.', 'error');
    renderCalendar();
    return;
  }

  busyRanges = data || [];
  currentState = 'loaded';
  const blockedDates = new Set();
  busyRanges.forEach((range) => {
    const cursor = dateFromKey(range.start_date);
    const last = dateFromKey(range.end_date);
    while (cursor <= last) {
      if (cursor.getFullYear() === visibleMonth.getFullYear() && cursor.getMonth() === visibleMonth.getMonth()) {
        blockedDates.add(dateKey(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  const count = blockedDates.size;
  setStatus(count ? `${count} ${count === 1 ? 'dia ocupado' : 'dias ocupados'} neste mês.` : 'Nenhum dia ocupado registrado neste mês.', 'loaded');
  renderCalendar();
}

previousButton.addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  loadAvailability();
});

nextButton.addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  loadAvailability();
});

const initialMonth = dateFromKey(fortalezaTodayKey());
visibleMonth = new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
loadAvailability();

window.addEventListener('focus', loadAvailability);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadAvailability();
});
window.setInterval(loadAvailability, 60_000);


