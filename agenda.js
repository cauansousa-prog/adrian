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
let selectedSlotIndex = null;
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
    if (!range.start_time && !range.end_time) return [{ label: 'dia todo', compact: 'Dia todo', sortTime: range.start_date === key ? '00:00' : (range.start_time || '00:00') }];
    if (!range.start_time || !range.end_time) return [{ label: 'dia todo', compact: 'Dia todo', sortTime: range.start_date === key ? '00:00' : (range.start_time || '00:00') }];

    if (range.start_date === range.end_date) {
      return [{ label: `das ${timeLabel(range.start_time)} às ${timeLabel(range.end_time)}`, compact: `${timeLabel(range.start_time)}–${timeLabel(range.end_time)}`, sortTime: range.start_time }];
    }
    if (key === range.start_date) {
      return [{ label: `a partir de ${timeLabel(range.start_time)}`, compact: `Após ${timeLabel(range.start_time)}`, sortTime: range.start_time }];
    }
    if (key === range.end_date) {
      if (range.end_time.startsWith('00:00')) return [];
      return [{ label: `até ${timeLabel(range.end_time)}`, compact: `Até ${timeLabel(range.end_time)}`, sortTime: '00:00' }];
    }
    return [{ label: 'dia todo', compact: 'Dia todo', sortTime: range.start_date === key ? '00:00' : (range.start_time || '00:00') }];
  }).sort((left, right) => left.sortTime.localeCompare(right.sortTime));
}

function renderDayDetails() {
  if (currentState !== 'loaded' || !selectedDayKey) {
    detailsElement.textContent = 'Os horários deste dia aparecem quando a consulta for concluída.';
    return;
  }

  const date = dateFromKey(selectedDayKey);
  const occupied = occupiedTimesForDate(selectedDayKey);
  if (!occupied.length) {
    detailsElement.textContent = `${dateFormatter.format(date)} · nenhum horário ocupado. Consulte a agenda pelo WhatsApp para combinar seu evento.`;
    return;
  }

  if (selectedSlotIndex !== null && occupied[selectedSlotIndex]) {
    const selected = occupied[selectedSlotIndex];
    const others = occupied.filter((_, index) => index !== selectedSlotIndex);
    detailsElement.textContent = `${dateFormatter.format(date)} · faixa selecionada: ${selected.label}. Este período está ocupado.${others.length ? ` Outros horários ocupados: ${others.map(({ label }) => label).join('; ')}.` : ''}`;
    return;
  }

  detailsElement.textContent = `${dateFormatter.format(date)} · horários ocupados: ${occupied.map(({ label }) => label).join('; ')}. Toque em um horário para ver os detalhes.`;
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
    const sameMonth = day.getMonth() === visibleMonth.getMonth();
    const occupied = currentState === 'loaded' ? occupiedTimesForDate(key) : [];
    const busy = occupied.length > 0;
    const dayStatus = currentState !== 'loaded'
      ? 'disponibilidade não consultada'
      : (busy ? `ocupado ${occupied.map(({ label }) => label).join(' e ')}` : 'sem horários ocupados');
    const dayCell = document.createElement(busy && sameMonth ? 'div' : 'button');
    if (dayCell.tagName === 'BUTTON') dayCell.type = 'button';
    dayCell.className = 'calendar-day';
    dayCell.setAttribute('aria-label', `${dateFormatter.format(day)}: ${dayStatus}`);

    if (busy && sameMonth) {
      const dateButton = document.createElement('button');
      dateButton.type = 'button';
      dateButton.className = 'calendar-date-select';
      dateButton.textContent = String(day.getDate());
      dateButton.setAttribute('aria-label', `${dateFormatter.format(day)}: ocupado. Selecionar o dia.`);
      dateButton.setAttribute('aria-pressed', String(key === selectedDayKey));
      dateButton.addEventListener('click', () => {
        selectedDayKey = key;
        selectedSlotIndex = null;
        renderCalendar();
      });

      const timeList = document.createElement('span');
      timeList.className = 'calendar-hour-list';
      occupied.forEach((interval, intervalIndex) => {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'calendar-time-slot';
        slot.textContent = interval.compact;
        slot.setAttribute('aria-label', `${dateFormatter.format(day)}: ${interval.label} ocupado. Toque para ver detalhes.`);
        slot.setAttribute('aria-pressed', String(key === selectedDayKey && intervalIndex === selectedSlotIndex));
        if (key === selectedDayKey && intervalIndex === selectedSlotIndex) slot.classList.add('is-selected');
        slot.addEventListener('click', () => {
          selectedDayKey = key;
          selectedSlotIndex = intervalIndex;
          renderCalendar();
        });
        timeList.append(slot);
      });
      dayCell.append(dateButton, timeList);
    } else {
      dayCell.textContent = String(day.getDate());
      dayCell.disabled = currentState !== 'loaded' || !sameMonth;
      dayCell.addEventListener('click', () => {
        if (dayCell.disabled) return;
        selectedDayKey = key;
        selectedSlotIndex = null;
        renderCalendar();
      });
    }

    if (!sameMonth) dayCell.classList.add('outside-month');
    if (currentState !== 'loaded') dayCell.classList.add('is-unknown');
    else dayCell.classList.add(busy ? 'is-busy' : 'is-free');
    if (key === todayKey) {
      dayCell.classList.add('is-today');
      if (dayCell.tagName === 'BUTTON') dayCell.setAttribute('aria-current', 'date');
      else dayCell.querySelector('.calendar-date-select')?.setAttribute('aria-current', 'date');
    }
    if (key === selectedDayKey) dayCell.classList.add('is-selected');
    daysElement.appendChild(dayCell);
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
  selectedSlotIndex = null;
  loadAvailability();
});

nextButton.addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  selectedDayKey = dateKey(visibleMonth);
  selectedSlotIndex = null;
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
