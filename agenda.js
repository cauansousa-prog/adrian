import { createAgendaClient } from './agenda-client.js';

const { client, error: clientError } = await createAgendaClient();
const daysElement = document.getElementById('calendarDays');
const monthElement = document.getElementById('calendarMonth');
const statusElement = document.getElementById('calendarStatus');
const previousButton = document.getElementById('calendarPrevious');
const nextButton = document.getElementById('calendarNext');
const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' });
const detailsElement = document.createElement('p');
detailsElement.className = 'calendar-day-details';
detailsElement.id = 'calendarDayDetails';
detailsElement.setAttribute('role', 'status');
detailsElement.setAttribute('aria-live', 'polite');
daysElement.insertAdjacentElement('afterend', detailsElement);

let visibleMonth;
let selectedDayKey;
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

function timeLabel(time) {
  return time.slice(0, 5);
}

function occupiedTimesForDate(key) {
  return busyRanges.flatMap((range) => {
    if (range.start_date > key || range.end_date < key) return [];
    if (!range.start_time && !range.end_time) return [{ label: 'dia todo', compact: 'Dia todo' }];
    if (!range.start_time || !range.end_time) return [{ label: 'dia todo', compact: 'Dia todo' }];

    if (range.start_date === range.end_date) {
      return [{ label: `das ${timeLabel(range.start_time)} às ${timeLabel(range.end_time)}`, compact: `${timeLabel(range.start_time)}–${timeLabel(range.end_time)}` }];
    }
    if (key === range.start_date) {
      return [{ label: `a partir de ${timeLabel(range.start_time)}`, compact: `Após ${timeLabel(range.start_time)}` }];
    }
    if (key === range.end_date) {
      if (range.end_time.startsWith('00:00')) return [];
      return [{ label: `até ${timeLabel(range.end_time)}`, compact: `Até ${timeLabel(range.end_time)}` }];
    }
    return [{ label: 'dia todo', compact: 'Dia todo' }];
  });
}

function renderDayDetails() {
  if (currentState !== 'loaded' || !selectedDayKey) {
    detailsElement.textContent = 'Os horários deste dia aparecem quando a consulta for concluída.';
    return;
  }

  const date = dateFromKey(selectedDayKey);
  const occupied = occupiedTimesForDate(selectedDayKey);
  detailsElement.textContent = occupied.length
    ? `${dateFormatter.format(date)} · horários ocupados: ${occupied.map(({ label }) => label).join('; ')}.`
    : `${dateFormatter.format(date)} · nenhum horário ocupado. Consulte a agenda pelo WhatsApp para combinar seu evento.`;
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
    const occupied = currentState === 'loaded' ? occupiedTimesForDate(key) : [];
    const busy = occupied.length > 0;
    const dayStatus = currentState !== 'loaded'
      ? 'disponibilidade não consultada'
      : (busy ? `ocupado ${occupied.map(({ label }) => label).join(' e ')}` : 'sem horários ocupados');
    button.type = 'button';
    button.className = 'calendar-day';
    button.textContent = String(day.getDate());
    if (busy) {
      const hours = document.createElement('span');
      hours.className = 'calendar-day-hours';
      hours.textContent = occupied.length > 1 ? `${occupied[0].compact} +${occupied.length - 1}` : occupied[0].compact;
      button.append(hours);
    }
    button.setAttribute('aria-label', `${dateFormatter.format(day)}: ${dayStatus}`);
    button.disabled = currentState !== 'loaded' || !sameMonth;

    if (!sameMonth) button.classList.add('outside-month');
    if (currentState !== 'loaded') button.classList.add('is-unknown');
    else button.classList.add(busy ? 'is-busy' : 'is-free');
    if (key === todayKey) {
      button.classList.add('is-today');
      button.setAttribute('aria-current', 'date');
    }
    if (key === selectedDayKey) button.classList.add('is-selected');
    button.addEventListener('click', () => {
      if (button.disabled) return;
      selectedDayKey = key;
      renderCalendar();
    });
    daysElement.appendChild(button);
  }

  previousButton.disabled = currentState === 'loading';
  nextButton.disabled = currentState === 'loading';
  renderDayDetails();
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
    .select('start_date,end_date,start_time,end_time')
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
    const cursor = dateFromKey(range.start_date > startKey ? range.start_date : startKey);
    const lastKey = range.end_date < endKey ? range.end_date : endKey;
    const last = dateFromKey(lastKey);
    while (cursor <= last) {
      const key = dateKey(cursor);
      if (occupiedTimesForDate(key).length) blockedDates.add(key);
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  const count = blockedDates.size;
  setStatus(count ? `${count} ${count === 1 ? 'dia com horário ocupado' : 'dias com horários ocupados'} neste mês.` : 'Nenhum horário ocupado registrado neste mês.', 'loaded');
  renderCalendar();
}

previousButton.addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  selectedDayKey = dateKey(visibleMonth);
  loadAvailability();
});

nextButton.addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  selectedDayKey = dateKey(visibleMonth);
  loadAvailability();
});

const initialMonth = dateFromKey(fortalezaTodayKey());
visibleMonth = new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
selectedDayKey = dateKey(initialMonth);
loadAvailability();

window.addEventListener('focus', loadAvailability);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadAvailability();
});
window.setInterval(loadAvailability, 30_000);
