import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowUpDown,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  ListChecks,
  Notebook,
  Plus,
  Redo2,
  Save,
  Search,
  Settings,
  Trash2,
  Undo2,
  Upload,
  Wind,
  X,
} from 'lucide-react';
import './styles.css';

const TASKS_KEY = 'tasktori.tasks.v1';
const APP_KEY = 'tasktori.app.v2';
const UI_KEY = 'tasktori.ui.v2';
const HISTORY_LIMIT = 100;
const COMPLETE_ANIMATION_MS = 520;
const BLAST_ANIMATION_MS = 980;

const DEFAULT_LIST_ID = 'main';

let audioContext;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

const playTone = ({ frequency, start, duration, gain, type = 'sine' }) => {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
  volume.gain.setValueAtTime(0.0001, context.currentTime + start);
  volume.gain.exponentialRampToValueAtTime(gain, context.currentTime + start + 0.018);
  volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
  oscillator.connect(volume).connect(context.destination);
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + duration + 0.02);
};

const playCompleteSound = () => {
  try {
    const context = getAudioContext();
    if (context.state === 'suspended') context.resume();
    playTone({ frequency: 523.25, start: 0, duration: 0.12, gain: 0.04, type: 'triangle' });
    playTone({ frequency: 659.25, start: 0.07, duration: 0.16, gain: 0.035, type: 'triangle' });
    playTone({ frequency: 987.77, start: 0.15, duration: 0.2, gain: 0.025, type: 'sine' });
  } catch {}
};

const playTickSound = () => {
  try {
    const context = getAudioContext();
    if (context.state === 'suspended') context.resume();
    playTone({ frequency: 740, start: 0, duration: 0.08, gain: 0.025, type: 'triangle' });
  } catch {}
};

const playBlastSound = () => {
  try {
    const context = getAudioContext();
    if (context.state === 'suspended') context.resume();
    playTone({ frequency: 220, start: 0, duration: 0.38, gain: 0.035, type: 'sawtooth' });
    playTone({ frequency: 330, start: 0.05, duration: 0.32, gain: 0.028, type: 'triangle' });
    playTone({ frequency: 880, start: 0.22, duration: 0.18, gain: 0.022, type: 'sine' });
  } catch {}
};

const pad = (value) => String(value).padStart(2, '0');
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

const createSubtask = (title) => {
  const now = nowIso();
  return { id: makeId(), title, done: false, createdAt: now, updatedAt: now };
};

const createTask = ({ title, deadline = null, subtasks = [], listId = DEFAULT_LIST_ID, priority = 0 }) => {
  const now = nowIso();
  return {
    id: makeId(),
    title,
    done: false,
    priority,
    deadline,
    memo: '',
    subtasks,
    expanded: false,
    listId,
    createdAt: now,
    updatedAt: now,
  };
};

const createTaskList = (title = 'メイン') => {
  const now = nowIso();
  return { id: makeId(), title, createdAt: now, updatedAt: now };
};

const createMemo = (body = '') => {
  const now = nowIso();
  return { id: makeId(), body, createdAt: now, updatedAt: now };
};

const normalizeSubtask = (subtask) => ({
  id: subtask.id || makeId(),
  title: subtask.title || '',
  done: Boolean(subtask.done),
  createdAt: subtask.createdAt || nowIso(),
  updatedAt: subtask.updatedAt || nowIso(),
});

const normalizeTask = (task) => ({
  id: task.id || makeId(),
  title: task.title || '',
  done: Boolean(task.done),
  priority: Number.isInteger(task.priority) ? Math.max(0, Math.min(3, task.priority)) : 0,
  deadline: task.deadline || null,
  memo: task.memo || '',
  subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(normalizeSubtask) : [],
  expanded: Boolean(task.expanded),
  section: task.section === 'someday' ? 'someday' : 'today',
  listId: task.listId || DEFAULT_LIST_ID,
  createdAt: task.createdAt || nowIso(),
  updatedAt: task.updatedAt || nowIso(),
});

const normalizeList = (list) => ({
  id: list.id || makeId(),
  title: list.title?.trim() || 'メイン',
  createdAt: list.createdAt || nowIso(),
  updatedAt: list.updatedAt || nowIso(),
});

const normalizeMemo = (memo) => ({
  id: memo.id || makeId(),
  body: memo.body || '',
  createdAt: memo.createdAt || nowIso(),
  updatedAt: memo.updatedAt || nowIso(),
});

const loadData = () => {
  try {
    const appRaw = localStorage.getItem(APP_KEY);
    if (appRaw) {
      const parsed = JSON.parse(appRaw);
      const lists = Array.isArray(parsed.lists) && parsed.lists.length > 0
        ? parsed.lists.map(normalizeList)
        : [{ id: DEFAULT_LIST_ID, title: 'メイン', createdAt: nowIso(), updatedAt: nowIso() }];
      return {
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map((task) => ({ ...normalizeTask(task), listId: task.listId || lists[0].id })) : [],
        memos: Array.isArray(parsed.memos) ? parsed.memos.map(normalizeMemo) : [],
        lists,
      };
    }

    const oldTasks = localStorage.getItem(TASKS_KEY);
    if (oldTasks) {
      const parsed = JSON.parse(oldTasks);
      return {
        tasks: Array.isArray(parsed) ? parsed.map((task) => ({ ...normalizeTask(task), listId: DEFAULT_LIST_ID })) : [],
        memos: [],
        lists: [{ id: DEFAULT_LIST_ID, title: 'メイン', createdAt: nowIso(), updatedAt: nowIso() }],
      };
    }
  } catch {}
  return { tasks: [], memos: [], lists: [{ id: DEFAULT_LIST_ID, title: 'メイン', createdAt: nowIso(), updatedAt: nowIso() }] };
};

const loadUi = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    return {
      activeTab: ['tasks', 'memos', 'settings'].includes(parsed.activeTab) ? parsed.activeTab : 'tasks',
      currentListId: parsed.currentListId || DEFAULT_LIST_ID,
      todayOnly: Boolean(parsed.todayOnly),
      sortBy: parsed.sortBy === 'created' || parsed.sortBy?.today === 'created' ? 'created' : 'recommended',
    };
  } catch {
    return { activeTab: 'tasks', currentListId: DEFAULT_LIST_ID, todayOnly: false, sortBy: 'recommended' };
  }
};

const initialHistory = { past: [], present: loadData(), future: [] };

const withHistory = (state, nextData) => ({
  past: [...state.past.slice(-(HISTORY_LIMIT - 1)), clone(state.present)],
  present: clone(nextData),
  future: [],
});

const historyReducer = (state, action) => {
  switch (action.type) {
    case 'APPLY':
      return withHistory(state, action.updater(clone(state.present)));
    case 'SET':
      return withHistory(state, action.data);
    case 'UNDO': {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: clone(state.past[state.past.length - 1]),
        future: [clone(state.present), ...state.future],
      };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      return {
        past: [...state.past, clone(state.present)].slice(-HISTORY_LIMIT),
        present: clone(state.future[0]),
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
};

const weekdayMap = {
  日曜: 0,
  日曜日: 0,
  月曜: 1,
  月曜日: 1,
  火曜: 2,
  火曜日: 2,
  水曜: 3,
  水曜日: 3,
  木曜: 4,
  木曜日: 4,
  金曜: 5,
  金曜日: 5,
  土曜: 6,
  土曜日: 6,
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 0, 0);
const normalizeDate = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), 0, 0);

const toLocalInputValue = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const weekdayPattern = '(日曜日|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜|月曜|火曜|水曜|木曜|金曜|土曜)';
const normalizeAnalysisText = (text) =>
  text.replace(/[０-９／：]/g, (char) => {
    if (char === '／') return '/';
    if (char === '：') return ':';
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });

const collectMatches = (text, pattern, mapper) => {
  const matches = [];
  for (const match of text.matchAll(pattern)) {
    const mapped = mapper(match);
    if (mapped) matches.push({ ...mapped, index: mapped.index ?? match.index ?? 0, raw: mapped.raw ?? match[0] });
  }
  return matches;
};

const adjustPastDate = (date, baseDate, mode = 'month') => {
  const today = startOfDay(baseDate);
  let next = startOfDay(date);
  if (next >= today) return next;
  if (mode === 'year') return new Date(date.getFullYear() + 1, date.getMonth(), date.getDate());
  return new Date(baseDate.getFullYear(), date.getMonth() + 1, date.getDate());
};

const parseSmartTime = (raw) => {
  let match = raw.match(/(午前|午後)?\s*([01]?\d|2[0-3]):([0-5]\d)/);
  if (match) {
    let hour = Number(match[2]);
    if (match[1] === '午後' && hour < 12) hour += 12;
    if (match[1] === '午前' && hour === 12) hour = 0;
    return { hour, minute: Number(match[3]) };
  }
  match = raw.match(/(午前|午後)?\s*(\d{1,2})時\s*([0-5]?\d)分/);
  if (match) {
    let hour = Number(match[2]);
    if (match[1] === '午後' && hour < 12) hour += 12;
    if (match[1] === '午前' && hour === 12) hour = 0;
    return { hour, minute: Number(match[3]) };
  }
  match = raw.match(/(午前|午後)?\s*(\d{1,2})時半/);
  if (match) {
    let hour = Number(match[2]);
    if (match[1] === '午後' && hour < 12) hour += 12;
    if (match[1] === '午前' && hour === 12) hour = 0;
    return { hour, minute: 30 };
  }
  match = raw.match(/(午前|午後)?\s*(\d{1,2})時/);
  if (match) {
    let hour = Number(match[2]);
    if (match[1] === '午後' && hour < 12) hour += 12;
    if (match[1] === '午前' && hour === 12) hour = 0;
    return { hour, minute: 0 };
  }
  return null;
};

const dateFromWeekday = (weekdayText, baseDate, addWeeks = 0) => {
  const compact = weekdayText.replace(/曜日$/, '曜');
  const target = weekdayMap[compact] ?? weekdayMap[weekdayText];
  const today = startOfDay(baseDate);
  const date = new Date(today);
  const diff = (target - today.getDay() + 7) % 7 || 7;
  date.setDate(today.getDate() + diff + addWeeks * 7);
  return date;
};

const collectDateCandidates = (text, baseDate) => {
  const today = startOfDay(baseDate);
  const candidates = [];

  candidates.push(
    ...collectMatches(text, /(再来週)\s*の?\s*(日曜日|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜|月曜|火曜|水曜|木曜|金曜|土曜)/g, (match) => ({
      date: dateFromWeekday(match[2], baseDate, 1),
      raw: match[0],
      kind: 'date',
    })),
    ...collectMatches(text, /(来週)\s*の?\s*(日曜日|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜|月曜|火曜|水曜|木曜|金曜|土曜)/g, (match) => ({
      date: dateFromWeekday(match[2], baseDate, 0),
      raw: match[0],
      kind: 'date',
    })),
    ...collectMatches(text, /明後日/g, (match) => {
      const date = new Date(today);
      date.setDate(today.getDate() + 2);
      return { date, raw: match[0], kind: 'date' };
    }),
    ...collectMatches(text, /明日/g, (match) => {
      const date = new Date(today);
      date.setDate(today.getDate() + 1);
      return { date, raw: match[0], kind: 'date' };
    }),
    ...collectMatches(text, /今日/g, (match) => ({ date: today, raw: match[0], kind: 'date' })),
    ...collectMatches(text, new RegExp(weekdayPattern, 'g'), (match) => ({ date: dateFromWeekday(match[1], baseDate), raw: match[0], kind: 'date' })),
    ...collectMatches(text, /(\d{4})\s*(?:\/|年)\s*(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})日?/g, (match) => ({
      date: new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      raw: match[0],
      kind: 'date',
    })),
    ...collectMatches(text, /(?<!\d)(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})日?/g, (match) => ({
      date: adjustPastDate(new Date(baseDate.getFullYear(), Number(match[1]) - 1, Number(match[2])), baseDate, 'year'),
      raw: match[0],
      kind: 'date',
    })),
    ...collectMatches(text, /(?<!\d)(\d{1,2})日/g, (match) => ({
      date: adjustPastDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), Number(match[1])), baseDate, 'month'),
      raw: match[0],
      kind: 'date',
    })),
  );

  return candidates.sort((a, b) => b.raw.length - a.raw.length);
};

const collectTimeCandidates = (text) =>
  [
    ...collectMatches(text, /(午前|午後)?\s*([01]?\d|2[0-3]):([0-5]\d)/g, (match) => ({ ...parseSmartTime(match[0]), raw: match[0], kind: 'time' })),
    ...collectMatches(text, /(午前|午後)?\s*(\d{1,2})時\s*([0-5]?\d)分/g, (match) => ({ ...parseSmartTime(match[0]), raw: match[0], kind: 'time' })),
    ...collectMatches(text, /(午前|午後)?\s*(\d{1,2})時半/g, (match) => ({ ...parseSmartTime(match[0]), raw: match[0], kind: 'time' })),
    ...collectMatches(text, /(午前|午後)?\s*(\d{1,2})時/g, (match) => ({ ...parseSmartTime(match[0]), raw: match[0], kind: 'time' })),
  ].filter((item) => Number.isInteger(item.hour));

const collectPriorityCandidates = (text) =>
  [
    ...collectMatches(text, /優先度\s*([0-3])/g, (match) => ({ priority: Number(match[1]), raw: match[0], kind: 'priority' })),
    ...collectMatches(text, /(?:^|[\s　])([高中低])(?:$|[\s　])/g, (match) => ({
      priority: match[1] === '高' ? 3 : match[1] === '中' ? 2 : 1,
      raw: match[1],
      index: (match.index ?? 0) + match[0].indexOf(match[1]),
      kind: 'priority',
    })),
  ];

const rangesOverlap = (a, b) => a.index < b.index + b.raw.length && b.index < a.index + a.raw.length;

const compactTitle = (text) =>
  text
    .replace(/[　\s]+/g, ' ')
    .replace(/^(の|に|まで|までに|中)+/g, '')
    .replace(/\s+(の|に|まで|までに|中)(?=\s|$)/g, ' ')
    .replace(/\s*(の|に|まで|までに|中)\s*$/g, '')
    .replace(/^[、,，\s　]+|[、,，\s　]+$/g, '')
    .trim();

const analyzeTaskLine = (line, baseDate = new Date()) => {
  const original = line.trim();
  if (!original) return { title: '', deadline: null, priority: 0, matches: [], humanDeadline: '' };
  const analysisText = normalizeAnalysisText(original);

  const dateCandidates = collectDateCandidates(analysisText, baseDate).map((candidate) => ({
    ...candidate,
    raw: original.slice(candidate.index, candidate.index + candidate.raw.length),
  }));
  const timeCandidates = collectTimeCandidates(analysisText).map((candidate) => ({
    ...candidate,
    raw: original.slice(candidate.index, candidate.index + candidate.raw.length),
  }));
  const priorityCandidates = collectPriorityCandidates(analysisText).map((candidate) => ({
    ...candidate,
    raw: original.slice(candidate.index, candidate.index + candidate.raw.length),
  }));
  const datePart = dateCandidates[0] || null;
  const timePart = timeCandidates.find((time) => !datePart || !rangesOverlap(time, datePart)) || timeCandidates[0] || null;
  const priorityPart = priorityCandidates[0] || null;

  let deadline = null;
  if (datePart || timePart) {
    const date = datePart
      ? new Date(datePart.date)
      : new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    if (timePart) date.setHours(timePart.hour, timePart.minute, 0, 0);
    else date.setHours(23, 59, 0, 0);
    deadline = normalizeDate(date).toISOString();
  }

  const matches = [datePart, timePart, priorityPart]
    .filter(Boolean)
    .map((item) => ({ ...item, end: item.index + item.raw.length }));

  let title = original;
  [...matches]
    .sort((a, b) => b.index - a.index)
    .forEach((match) => {
      const raw = match.removeRaw || match.raw;
      title = title.slice(0, match.index) + title.slice(match.index + raw.length);
    });
  title = compactTitle(title) || original;

  return {
    title,
    deadline,
    priority: priorityPart?.priority ?? 0,
    matches,
    humanDeadline: deadline ? formatHumanDeadline(deadline) : '',
  };
};

const parseDeadline = (line, baseDate = new Date()) => {
  const analyzed = analyzeTaskLine(line, baseDate);
  return { title: analyzed.title, deadline: analyzed.deadline, priority: analyzed.priority };
};

const parseBulkTasks = (input, listId) => {
  const tasks = [];
  let currentParent = null;
  input.split(/\r?\n/).forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    const childMatch = trimmed.match(/^[・\-ー*]\s*(.+)$/);
    if (childMatch && currentParent) {
      const parsed = parseDeadline(childMatch[1]);
      currentParent.subtasks.push(createSubtask(parsed.title));
      currentParent.updatedAt = nowIso();
      return;
    }

    const parsed = parseDeadline(childMatch ? childMatch[1] : trimmed);
    const task = createTask({ title: parsed.title, deadline: parsed.deadline, priority: parsed.priority, listId });
    tasks.push(task);
    currentParent = task;
  });
  return tasks;
};

const taskDisplaySection = (task, today = new Date()) => {
  if (!task.deadline) return task.section === 'someday' ? 'someday' : 'today';
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return task.section === 'someday' ? 'someday' : 'today';
  return deadline < startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) ? 'today' : 'someday';
};

const taskGroupRank = (task) => {
  if (!task.deadline) return 2;
  const deadline = new Date(task.deadline);
  const now = new Date();
  if (deadline < now) return 0;
  if (deadline <= endOfDay(now)) return 1;
  return 2;
};

const sortTasks = (tasks, sortBy) =>
  [...tasks].sort((a, b) => {
    if (sortBy === 'created') return new Date(a.createdAt) - new Date(b.createdAt);
    const groupDiff = taskGroupRank(a) - taskGroupRank(b);
    if (groupDiff !== 0) return groupDiff;
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

const formatDeadline = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  const label = diff === 0 ? '今日' : diff === 1 ? '明日' : `${date.getMonth() + 1}/${date.getDate()}`;
  return `${label} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatHumanDeadline = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  const prefix =
    diff === 0
      ? '今日'
      : diff === 1
        ? '明日'
        : diff === 2
          ? '明後日'
          : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
  return `${prefix} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const memoTitle = (memo) => {
  const line = memo.body.split(/\r?\n/).find((item) => item.trim());
  return line?.trim() || '無題メモ';
};

function App() {
  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const [ui, setUi] = useState(loadUi);
  const [route, setRoute] = useState({ name: 'tasks' });
  const [adding, setAdding] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [priorityMode, setPriorityMode] = useState(false);
  const [completingIds, setCompletingIds] = useState(() => new Set());
  const [blasting, setBlasting] = useState(false);
  const [memoBlasting, setMemoBlasting] = useState(false);
  const [memoSearch, setMemoSearch] = useState('');
  const [memoSelection, setMemoSelection] = useState(() => new Set());
  const [memoSelectMode, setMemoSelectMode] = useState(false);
  const [swipeStart, setSwipeStart] = useState(null);
  const importRef = useRef(null);

  const { tasks, memos, lists } = history.present;
  const currentList = lists.find((list) => list.id === ui.currentListId) || lists[0];
  const selectedTask = tasks.find((task) => task.id === route.taskId);
  const selectedMemo = memos.find((memo) => memo.id === route.memoId);
  const visibleTasks = useMemo(() => {
    const active = tasks.filter((task) => {
      const inCurrentList = task.listId === currentList?.id;
      const activeTask = !task.done || completingIds.has(task.id);
      const dueToday = task.deadline && new Date(task.deadline) < startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1));
      return inCurrentList && activeTask && (!ui.todayOnly || dueToday);
    });
    return sortTasks(active, ui.sortBy);
  }, [tasks, completingIds, currentList?.id, ui.todayOnly, ui.sortBy]);

  const filteredMemos = useMemo(() => {
    const query = memoSearch.trim().toLowerCase();
    return memos
      .filter((memo) => !query || memo.body.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [memos, memoSearch]);

  useEffect(() => {
    localStorage.setItem(APP_KEY, JSON.stringify(history.present));
  }, [history.present]);

  useEffect(() => {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  }, [ui]);

  useEffect(() => {
    if (route.name === 'taskDetail' && !selectedTask) setRoute({ name: 'tasks' });
    if (route.name === 'memoEdit' && route.memoId !== 'new' && !selectedMemo) setRoute({ name: 'memos' });
  }, [route, selectedTask, selectedMemo]);

  const mutateData = (updater) => dispatch({ type: 'APPLY', updater });
  const switchTab = (activeTab) => {
    setUi((current) => ({ ...current, activeTab }));
    setRoute({ name: activeTab });
    setAdding(false);
    setMemoSelectMode(false);
    setMemoSelection(new Set());
  };
  const switchList = (direction) => {
    if (lists.length <= 1) return;
    const currentIndex = Math.max(0, lists.findIndex((list) => list.id === currentList?.id));
    const nextIndex = (currentIndex + direction + lists.length) % lists.length;
    setUi((current) => ({ ...current, currentListId: lists[nextIndex].id, todayOnly: false }));
    setAdding(false);
  };
  const setTaskSort = (sortBy) => {
    setUi((current) => ({ ...current, sortBy }));
  };
  const addTaskList = () => {
    const list = createTaskList(`リスト${lists.length + 1}`);
    mutateData((draft) => ({ ...draft, lists: [...draft.lists, list] }));
    setUi((current) => ({ ...current, currentListId: list.id, todayOnly: false }));
    setAdding(false);
  };
  const renameTaskList = (listId, title) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    mutateData((draft) => ({
      ...draft,
      lists: draft.lists.map((list) => (list.id === listId ? { ...list, title: nextTitle, updatedAt: nowIso() } : list)),
    }));
  };
  const deleteTaskList = (listId) => {
    const target = lists.find((list) => list.id === listId);
    if (!target || target.id === DEFAULT_LIST_ID || lists.length <= 1) return;
    if (!window.confirm(`${target.title}を削除しますか？この一覧内のタスクも削除されます。`)) return;
    const currentIndex = lists.findIndex((list) => list.id === listId);
    const nextList = lists[currentIndex + 1] || lists[currentIndex - 1] || lists.find((list) => list.id === DEFAULT_LIST_ID);
    mutateData((draft) => ({
      ...draft,
      lists: draft.lists.filter((list) => list.id !== listId),
      tasks: draft.tasks.filter((task) => task.listId !== listId),
    }));
    setUi((current) => ({ ...current, currentListId: nextList?.id || DEFAULT_LIST_ID, todayOnly: false }));
    setAdding(false);
  };
  const updateTask = (taskId, updater) => {
    mutateData((draft) => ({
      ...draft,
      tasks: draft.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const updated = typeof updater === 'function' ? updater({ ...task, subtasks: [...task.subtasks] }) : { ...task, ...updater };
        return { ...updated, updatedAt: nowIso() };
      }),
    }));
  };
  const addBulk = () => {
    const newTasks = parseBulkTasks(bulkText, currentList?.id || DEFAULT_LIST_ID);
    if (newTasks.length === 0) return;
    mutateData((draft) => ({ ...draft, tasks: [...draft.tasks, ...newTasks] }));
    setBulkText('');
    setAdding(false);
  };
  const deleteTask = (taskId) => {
    mutateData((draft) => ({ ...draft, tasks: draft.tasks.filter((task) => task.id !== taskId) }));
    setRoute({ name: 'tasks' });
  };
  const completeTask = (task) => {
    if (task.done || completingIds.has(task.id)) return;
    playCompleteSound();
    setCompletingIds((current) => new Set(current).add(task.id));
    window.setTimeout(() => {
      updateTask(task.id, { done: true, expanded: false });
      setCompletingIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }, COMPLETE_ANIMATION_MS);
  };
  const blastAllTasks = () => {
    const visibleIds = new Set(visibleTasks.map((task) => task.id));
    if (visibleIds.size === 0 || blasting) return;
    playBlastSound();
    setRoute({ name: 'tasks' });
    setAdding(false);
    setBlasting(true);
    window.setTimeout(() => {
      mutateData((draft) => ({ ...draft, tasks: draft.tasks.filter((task) => !visibleIds.has(task.id)) }));
      setCompletingIds(new Set());
      setBlasting(false);
    }, BLAST_ANIMATION_MS);
  };
  const toggleSubtask = (taskId, subtaskId) => {
    const task = tasks.find((item) => item.id === taskId);
    const subtask = task?.subtasks.find((item) => item.id === subtaskId);
    if (subtask && !subtask.done) playTickSound();
    updateTask(taskId, (task) => ({
      ...task,
      subtasks: task.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, done: !subtask.done, updatedAt: nowIso() } : subtask,
      ),
    }));
  };
  const saveMemo = (memoId, body) => {
    if (memoId === 'new') {
      if (body.trim()) mutateData((draft) => ({ ...draft, memos: [createMemo(body), ...draft.memos] }));
    } else {
      mutateData((draft) => ({
        ...draft,
        memos: draft.memos.map((memo) => (memo.id === memoId ? { ...memo, body, updatedAt: nowIso() } : memo)),
      }));
    }
    setRoute({ name: 'memos' });
  };
  const deleteSelectedMemos = () => {
    const ids = memoSelection;
    if (ids.size === 0) return;
    mutateData((draft) => ({ ...draft, memos: draft.memos.filter((memo) => !ids.has(memo.id)) }));
    setMemoSelection(new Set());
    setMemoSelectMode(false);
  };
  const deleteMemo = (memoId) => {
    mutateData((draft) => ({ ...draft, memos: draft.memos.filter((memo) => memo.id !== memoId) }));
  };
  const deleteAllMemos = () => {
    const visibleIds = new Set(filteredMemos.map((memo) => memo.id));
    if (visibleIds.size === 0 || memoBlasting) return;
    playBlastSound();
    setMemoSelection(new Set());
    setMemoSelectMode(false);
    setMemoBlasting(true);
    window.setTimeout(() => {
      mutateData((draft) => ({ ...draft, memos: draft.memos.filter((memo) => !visibleIds.has(memo.id)) }));
      setMemoBlasting(false);
    }, BLAST_ANIMATION_MS);
  };
  const deleteEveryMemoWithConfirm = () => {
    if (memos.length === 0) return;
    if (!window.confirm('すべてのメモを削除しますか？')) return;
    mutateData((draft) => ({ ...draft, memos: [] }));
    setMemoSelection(new Set());
    setMemoSelectMode(false);
  };
  const exportData = () => {
    const payload = { version: 2, exportedAt: nowIso(), data: history.present, ui };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tasktori-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const source = parsed.data || parsed;
      const nextData = {
        tasks: Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [],
        memos: Array.isArray(source.memos) ? source.memos.map(normalizeMemo) : [],
        lists: Array.isArray(source.lists) && source.lists.length > 0 ? source.lists.map(normalizeList) : [{ id: DEFAULT_LIST_ID, title: 'メイン', createdAt: nowIso(), updatedAt: nowIso() }],
      };
      if (!window.confirm('現在のローカルデータをインポート内容で置き換えますか？')) return;
      dispatch({ type: 'SET', data: nextData });
      if (parsed.ui) setUi((current) => ({ ...current, ...parsed.ui }));
    } catch {
      window.alert('JSONを読み込めませんでした。');
    }
  };

  const headerAction =
    ui.activeTab === 'tasks' ? (
      <button className="blastButton" onClick={blastAllTasks} disabled={visibleTasks.length === 0 || blasting} aria-label="表示中のタスクを吹き飛ばす">
        <Wind size={20} />
      </button>
    ) : ui.activeTab === 'memos' && route.name !== 'memoEdit' ? (
      <button className="blastButton" onClick={deleteAllMemos} disabled={filteredMemos.length === 0 || memoBlasting} aria-label="表示中のメモを吹き飛ばす">
        <Wind size={20} />
      </button>
    ) : null;

  return (
    <div className={`appShell ${blasting || memoBlasting ? 'blasting' : ''}`}>
      <header className="topBar">
        <div className="historyButtons">
          <button className="iconButton" onClick={() => dispatch({ type: 'UNDO' })} disabled={history.past.length === 0 || blasting || memoBlasting} aria-label="戻る">
            <Undo2 size={21} />
          </button>
          <button className="iconButton" onClick={() => dispatch({ type: 'REDO' })} disabled={history.future.length === 0 || blasting || memoBlasting} aria-label="進む">
            <Redo2 size={21} />
          </button>
        </div>
        <div className="brand">
          <ListChecks size={21} />
          <span>Tasktori</span>
        </div>
        <div className="headerAction">{headerAction}</div>
      </header>

      {(blasting || memoBlasting) && <BlastScene />}

      {ui.activeTab === 'tasks' && (
        route.name === 'taskDetail' && selectedTask ? (
          <DetailView
            task={selectedTask}
            lists={lists}
            onBack={() => setRoute({ name: 'tasks' })}
            onUpdate={(updater) => updateTask(selectedTask.id, updater)}
            onDelete={() => deleteTask(selectedTask.id)}
            onToggleSubtask={(subtaskId) => toggleSubtask(selectedTask.id, subtaskId)}
          />
        ) : (
          <TaskScreen
            tasks={tasks}
            currentList={currentList}
            lists={lists}
            visibleTasks={visibleTasks}
            todayOnly={ui.todayOnly}
            sortBy={ui.sortBy}
            priorityMode={priorityMode}
            completingIds={completingIds}
            blasting={blasting}
            adding={adding}
            bulkText={bulkText}
            onSwipeStart={setSwipeStart}
            onSwipeEnd={(x) => {
              if (swipeStart !== null && Math.abs(x - swipeStart) > 58) switchList(x - swipeStart > 0 ? -1 : 1);
              setSwipeStart(null);
            }}
            onSwitchList={switchList}
            onAddTaskList={addTaskList}
            onRenameTaskList={renameTaskList}
            onDeleteTaskList={deleteTaskList}
            onToggleTodayOnly={() => setUi((current) => ({ ...current, todayOnly: !current.todayOnly }))}
            onSetSort={setTaskSort}
            onTogglePriority={() => setPriorityMode(!priorityMode)}
            onOpenTask={(taskId) => setRoute({ name: 'taskDetail', taskId })}
            onToggleDone={completeTask}
            onToggleExpanded={(task) => updateTask(task.id, { expanded: !task.expanded })}
            onToggleSubtask={toggleSubtask}
            onPriority={(task, priority) => updateTask(task.id, { priority })}
            onAddOpen={() => setAdding(true)}
            onAddClose={() => setAdding(false)}
            onBulkText={setBulkText}
            onAddBulk={addBulk}
          />
        )
      )}

      {ui.activeTab === 'memos' && (
        route.name === 'memoEdit' ? (
          <MemoEditor memo={route.memoId === 'new' ? null : selectedMemo} onSave={saveMemo} />
        ) : (
          <MemoScreen
            memos={filteredMemos}
            search={memoSearch}
            blasting={memoBlasting}
            selectMode={memoSelectMode}
            selection={memoSelection}
            onSearch={setMemoSearch}
            onNew={() => setRoute({ name: 'memoEdit', memoId: 'new' })}
            onOpen={(memoId) => setRoute({ name: 'memoEdit', memoId })}
            onSelectMode={() => setMemoSelectMode(true)}
            onCancelSelect={() => {
              setMemoSelectMode(false);
              setMemoSelection(new Set());
            }}
            onToggleSelect={(memoId) =>
              setMemoSelection((current) => {
                const next = new Set(current);
                if (next.has(memoId)) next.delete(memoId);
                else next.add(memoId);
                return next;
              })
            }
            onDeleteSelected={deleteSelectedMemos}
            onDeleteMemo={deleteMemo}
          />
        )
      )}

      {ui.activeTab === 'settings' && (
        <SettingsScreen
          taskCount={tasks.length}
          memoCount={memos.length}
          onDeleteTasks={() => {
            if (tasks.length && window.confirm('すべてのタスクを削除しますか？')) mutateData((draft) => ({ ...draft, tasks: [] }));
          }}
          onDeleteMemos={deleteEveryMemoWithConfirm}
          onDeleteAll={() => {
            if (window.confirm('タスクとメモをすべて削除しますか？')) dispatch({ type: 'SET', data: { tasks: [], memos: [], lists: [{ id: DEFAULT_LIST_ID, title: 'メイン', createdAt: nowIso(), updatedAt: nowIso() }] } });
          }}
          onExport={exportData}
          onImport={() => importRef.current?.click()}
        />
      )}

      <input ref={importRef} type="file" accept="application/json" hidden onChange={importData} />
      <BottomTabs activeTab={ui.activeTab} onSwitch={switchTab} />
    </div>
  );
}

function BlastScene() {
  return (
    <div className="blastScene" aria-hidden="true">
      <div className="stormBird">
        <span className="wing left" />
        <span className="body" />
        <span className="wing right" />
      </div>
      <span className="windLine line1" />
      <span className="windLine line2" />
      <span className="windLine line3" />
      <span className="windLine line4" />
    </div>
  );
}

function SmartTaskInput({ value, listTitle, onChange }) {
  const lines = value.split(/\r?\n/);

  return (
    <div className="smartInput">
      <div className="smartTextareaWrap">
        <div className="highlightLayer" aria-hidden="true">
          {lines.map((line, index) => (
            <React.Fragment key={`${line}-${index}`}>
              {renderHighlightedLine(line)}
              {index < lines.length - 1 && '\n'}
            </React.Fragment>
          ))}
        </div>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={`${listTitle}に追加\n木曜 打ち合わせ 12時\n高 明日 郵便局\n・持ち物確認`} autoFocus />
      </div>
    </div>
  );
}

function renderHighlightedLine(line) {
  const analyzed = analyzeTaskLine(line);
  if (!analyzed.matches.length) return <span>{line || ' '}</span>;
  const parts = [];
  let cursor = 0;
  analyzed.matches
    .filter((match) => match.kind === 'date' || match.kind === 'time')
    .sort((a, b) => a.index - b.index)
    .forEach((match) => {
      if (match.index < cursor) return;
      if (match.index > cursor) parts.push(<span key={`t-${cursor}`}>{line.slice(cursor, match.index)}</span>);
      parts.push(
        <mark key={`m-${match.index}`} className="deadlineHighlight">
          {line.slice(match.index, match.end)}
        </mark>,
      );
      cursor = match.end;
    });
  if (cursor < line.length) parts.push(<span key={`t-${cursor}`}>{line.slice(cursor)}</span>);
  return parts;
}

function TaskScreen(props) {
  const {
    currentList,
    lists,
    visibleTasks,
    todayOnly,
    sortBy,
    priorityMode,
    completingIds,
    blasting,
    adding,
    bulkText,
    onSwipeStart,
    onSwipeEnd,
    onSwitchList,
    onAddTaskList,
    onRenameTaskList,
    onDeleteTaskList,
    onToggleTodayOnly,
    onSetSort,
    onTogglePriority,
    onOpenTask,
    onToggleDone,
    onToggleExpanded,
    onToggleSubtask,
    onPriority,
    onAddOpen,
    onAddClose,
    onBulkText,
    onAddBulk,
  } = props;
  const [sortOpen, setSortOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [listTitleDraft, setListTitleDraft] = useState(currentList?.title || '');
  const taskTouchRef = useRef(null);
  const ignoreTaskTapRef = useRef(false);
  const canDeleteList = currentList && currentList.id !== DEFAULT_LIST_ID && lists.length > 1;

  useEffect(() => {
    setListTitleDraft(currentList?.title || '');
    setRenaming(false);
    setListMenuOpen(false);
  }, [currentList?.id, currentList?.title]);

  const saveListName = () => {
    onRenameTaskList(currentList.id, listTitleDraft);
    setRenaming(false);
    setListMenuOpen(false);
  };

  return (
    <main
      className="listView"
      onClick={() => {
        if (ignoreTaskTapRef.current) {
          ignoreTaskTapRef.current = false;
          return;
        }
        if (adding) onAddClose();
        else onAddOpen();
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        taskTouchRef.current = { x: touch.clientX, y: touch.clientY };
        onSwipeStart(touch.clientX);
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        const start = taskTouchRef.current;
        if (start) {
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.hypot(dx, dy) > 10) ignoreTaskTapRef.current = true;
        }
        taskTouchRef.current = null;
        onSwipeEnd(touch.clientX);
      }}
    >
      <div className="listSwitcher" onClick={(event) => event.stopPropagation()}>
        <button className="plainIcon" onClick={() => onSwitchList(-1)} aria-label="前の一覧" disabled={lists.length <= 1}>
          <ChevronLeft size={20} />
        </button>
        <div className="listTitleWrap">
          <button className="listTitleButton" onClick={() => setListMenuOpen(!listMenuOpen)}>
            {currentList?.title || 'メイン'}
          </button>
          {listMenuOpen && (
            <div className="listMenu">
              {renaming ? (
                <div className="renameBox">
                  <input value={listTitleDraft} onChange={(event) => setListTitleDraft(event.target.value)} autoFocus />
                  <button onClick={saveListName}>保存</button>
                </div>
              ) : (
                <>
                  <button onClick={() => setRenaming(true)}>名前変更</button>
                  <button className="dangerMenuItem" onClick={() => onDeleteTaskList(currentList.id)} disabled={!canDeleteList}>
                    削除
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button className="plainIcon" onClick={() => onSwitchList(1)} aria-label="次の一覧" disabled={lists.length <= 1}>
          <ChevronRight size={20} />
        </button>
        <button className="iconButton listAddButton" onClick={onAddTaskList} aria-label="タスク一覧を追加">
          <Plus size={20} />
        </button>
      </div>

      <div className="taskToolbar" onClick={(event) => event.stopPropagation()}>
        <button className={`textButton ${todayOnly ? 'active' : ''}`} onClick={onToggleTodayOnly}>
          今日
        </button>
        <div className="sortControl">
          <button className="iconButton" onClick={() => setSortOpen(!sortOpen)} aria-label="並び替え">
            <ArrowUpDown size={20} />
          </button>
          {sortOpen && (
            <div className="sortMenu">
              <button className={sortBy === 'recommended' ? 'selected' : ''} onClick={() => { onSetSort('recommended'); setSortOpen(false); }}>
                おすすめ順
              </button>
              <button className={sortBy === 'created' ? 'selected' : ''} onClick={() => { onSetSort('created'); setSortOpen(false); }}>
                登録順
              </button>
            </div>
          )}
        </div>
        <button className={`textButton ${priorityMode ? 'active' : ''}`} onClick={onTogglePriority}>
          優先度編集
        </button>
      </div>

      <div className="taskList">
        {visibleTasks.length === 0 ? (
          <div className="emptyState">
            <History size={28} />
            <p>{todayOnly ? '今日のタスクはありません' : 'タスクはありません'}</p>
          </div>
        ) : (
          visibleTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              completing={completingIds.has(task.id)}
              blasting={blasting}
              priorityMode={priorityMode}
              onOpen={() => onOpenTask(task.id)}
              onToggleDone={() => onToggleDone(task)}
              onToggleExpanded={(event) => {
                event.stopPropagation();
                onToggleExpanded(task);
              }}
              onToggleSubtask={(event, subtaskId) => {
                event.stopPropagation();
                onToggleSubtask(task.id, subtaskId);
              }}
              onPriority={(event, priority) => {
                event.stopPropagation();
                onPriority(task, priority);
              }}
            />
          ))
        )}
      </div>

      <section className={`addDock ${adding ? 'open' : ''}`} onClick={(event) => event.stopPropagation()}>
        {adding ? (
          <>
            <SmartTaskInput
              value={bulkText}
              listTitle={currentList?.title || 'メイン'}
              onChange={onBulkText}
            />
            <div className="dockActions">
              <button className="iconButton quiet" onClick={onAddClose} aria-label="閉じる">
                <X size={22} />
              </button>
              <button className="primaryButton" onClick={onAddBulk}>
                <Save size={18} />
                登録
              </button>
            </div>
          </>
        ) : (
          <button className="addButton" onClick={onAddOpen} aria-label="タスクを追加">
            <Plus size={31} />
          </button>
        )}
      </section>
    </main>
  );
}

function TaskRow({ task, completing, blasting, priorityMode, onOpen, onToggleDone, onToggleExpanded, onToggleSubtask, onPriority }) {
  const hasInlineContent = Boolean(task.memo.trim()) || task.subtasks.length > 0;
  return (
    <article
      className={`taskItem ${task.done ? 'done' : ''} ${completing ? 'completing' : ''} ${blasting ? 'blastAway' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <div className="taskMain">
        <div className="expandSlot">
          {hasInlineContent && (
            <button className="plainIcon" onClick={onToggleExpanded} aria-label={task.expanded ? '閉じる' : '開く'}>
              {task.expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
          )}
        </div>
        <label className="checkWrap" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" checked={task.done || completing} onChange={onToggleDone} />
          <span />
        </label>
        <div className="taskText">
          <strong>{task.title}</strong>
          {task.deadline && <time>{formatDeadline(task.deadline)}</time>}
        </div>
        {priorityMode && (
          <div className="priorityBar" aria-label="優先度">
            {[0, 1, 2, 3].map((priority) => (
              <button key={priority} className={priority <= task.priority ? 'filled' : ''} onClick={(event) => onPriority(event, priority)} aria-label={`優先度${priority}`} />
            ))}
          </div>
        )}
      </div>
      {task.expanded && hasInlineContent && (
        <div className="expandedPanel" onClick={(event) => event.stopPropagation()}>
          {task.memo.trim() && <p className="memoPreview">{task.memo}</p>}
          {task.subtasks.length > 0 && (
            <div className="subtaskList">
              {task.subtasks.map((subtask) => (
                <label key={subtask.id} className={`subtaskCheck ${subtask.done ? 'done' : ''}`}>
                  <input type="checkbox" checked={subtask.done} onChange={(event) => onToggleSubtask(event, subtask.id)} />
                  <span>{subtask.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function DetailView({ task, lists, onBack, onUpdate, onDelete, onToggleSubtask }) {
  const [newSubtask, setNewSubtask] = useState('');
  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title) return;
    onUpdate((draft) => ({ ...draft, subtasks: [...draft.subtasks, createSubtask(title)] }));
    setNewSubtask('');
  };
  const updateSubtaskTitle = (subtaskId, title) => {
    onUpdate((draft) => ({
      ...draft,
      subtasks: draft.subtasks.map((subtask) => (subtask.id === subtaskId ? { ...subtask, title, updatedAt: nowIso() } : subtask)),
    }));
  };
  const deleteSubtask = (subtaskId) => {
    onUpdate((draft) => ({ ...draft, subtasks: draft.subtasks.filter((subtask) => subtask.id !== subtaskId) }));
  };

  return (
    <main className="detailView">
      <div className="detailHeader">
        <button className="iconButton" onClick={onBack} aria-label="一覧へ戻る">
          <ArrowLeft size={22} />
        </button>
        <h1>詳細</h1>
        <button className="iconButton danger" onClick={onDelete} aria-label="削除">
          <Trash2 size={21} />
        </button>
      </div>
      <label className="fieldLabel">
        タスク名
        <input value={task.title} onChange={(event) => onUpdate({ title: event.target.value })} />
      </label>
      <label className="fieldLabel">
        優先度
        <div className="priorityPicker">
          {[0, 1, 2, 3].map((priority) => (
            <button key={priority} className={task.priority === priority ? 'selected' : ''} onClick={() => onUpdate({ priority })}>
              {priority}
            </button>
          ))}
        </div>
      </label>
      <label className="fieldLabel">
        締切日時
        <input type="datetime-local" value={toLocalInputValue(task.deadline)} onChange={(event) => onUpdate({ deadline: event.target.value ? new Date(event.target.value).toISOString() : null })} />
      </label>
      <label className="fieldLabel">
        所属
        <select value={task.listId || DEFAULT_LIST_ID} onChange={(event) => onUpdate({ listId: event.target.value })}>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.title}
            </option>
          ))}
        </select>
      </label>
      <label className="fieldLabel">
        メモ
        <textarea className="memoInput" value={task.memo} onChange={(event) => onUpdate({ memo: event.target.value })} placeholder="メモ" />
      </label>
      <section className="detailSection">
        <h2>チェックリスト</h2>
        <div className="detailSubtasks">
          {task.subtasks.map((subtask) => (
            <div key={subtask.id} className="detailSubtaskRow">
              <input type="checkbox" checked={subtask.done} onChange={() => onToggleSubtask(subtask.id)} />
              <input value={subtask.title} onChange={(event) => updateSubtaskTitle(subtask.id, event.target.value)} />
              <button className="plainIcon danger" onClick={() => deleteSubtask(subtask.id)} aria-label="子タスク削除">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <div className="newSubtaskRow">
          <input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addSubtask()} placeholder="チェック項目を追加" />
          <button className="iconButton" onClick={addSubtask} aria-label="追加">
            <Plus size={20} />
          </button>
        </div>
      </section>
    </main>
  );
}

function MemoScreen(props) {
  const { memos, search, blasting, selectMode, selection, onSearch, onNew, onOpen, onSelectMode, onCancelSelect, onToggleSelect, onDeleteSelected, onDeleteMemo } = props;
  const [memoSwipe, setMemoSwipe] = useState(null);
  const swipeDeletedRef = useRef(false);
  const memoTouchRef = useRef(null);
  const ignoreMemoTapRef = useRef(false);
  return (
    <main
      className="memoView"
      onClick={() => {
        if (ignoreMemoTapRef.current) {
          ignoreMemoTapRef.current = false;
          return;
        }
        if (!selectMode) onNew();
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        memoTouchRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        const start = memoTouchRef.current;
        if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) {
          ignoreMemoTapRef.current = true;
        }
        memoTouchRef.current = null;
      }}
    >
      <div className="memoToolbar" onClick={(event) => event.stopPropagation()}>
        <label className="searchBox">
          <Search size={18} />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="メモを検索" />
        </label>
        {selectMode ? (
          <>
            <button className="textButton dangerText" onClick={onDeleteSelected} disabled={selection.size === 0}>
              削除
            </button>
            <button className="textButton" onClick={onCancelSelect}>キャンセル</button>
          </>
        ) : (
          <>
            <button className="textButton" onClick={onSelectMode}>選択</button>
          </>
        )}
      </div>
      <div className="memoList">
        {memos.length === 0 ? (
          <div className="emptyState">
            <Notebook size={28} />
            <p>メモはありません</p>
          </div>
        ) : (
          memos.map((memo) => (
            <article
              key={memo.id}
              className={`memoItem ${blasting ? 'blastAway' : ''}`}
              onTouchStart={(event) => setMemoSwipe({ id: memo.id, x: event.touches[0].clientX })}
              onTouchEnd={(event) => {
                if (memoSwipe?.id === memo.id && memoSwipe.x - event.changedTouches[0].clientX > 72) {
                  event.stopPropagation();
                  swipeDeletedRef.current = true;
                  onDeleteMemo(memo.id);
                }
                setMemoSwipe(null);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (swipeDeletedRef.current) {
                  swipeDeletedRef.current = false;
                  return;
                }
                if (selectMode) onToggleSelect(memo.id);
                else onOpen(memo.id);
              }}
            >
              {selectMode && <input type="checkbox" checked={selection.has(memo.id)} onChange={() => onToggleSelect(memo.id)} onClick={(event) => event.stopPropagation()} />}
              <div>
                <strong>{memoTitle(memo)}</strong>
                <p>{memo.body.replace(/\s+/g, ' ').trim() || '本文なし'}</p>
              </div>
            </article>
          ))
        )}
      </div>
      <section className="addDock" onClick={(event) => event.stopPropagation()}>
        <button className="addButton" onClick={onNew} aria-label="メモを追加">
          <Plus size={31} />
        </button>
      </section>
    </main>
  );
}

function MemoEditor({ memo, onSave }) {
  const [body, setBody] = useState(memo?.body || '');
  const memoId = memo?.id || 'new';
  return (
    <main className="detailView">
      <div className="detailHeader">
        <button className="iconButton" onClick={() => onSave(memoId, body)} aria-label="保存して戻る">
          <ArrowLeft size={22} />
        </button>
        <h1>メモ編集</h1>
        <span />
      </div>
      <textarea className="memoEditorInput" value={body} onChange={(event) => setBody(event.target.value)} placeholder="メモを書く" autoFocus />
    </main>
  );
}

function SettingsScreen({ taskCount, memoCount, onDeleteTasks, onDeleteMemos, onDeleteAll, onExport, onImport }) {
  return (
    <main className="settingsView">
      <h1>データ管理</h1>
      <div className="settingsList">
        <button onClick={onExport}>
          <Download size={19} />
          ローカルデータをエクスポート
        </button>
        <button onClick={onImport}>
          <Upload size={19} />
          JSONからインポート
        </button>
        <button className="dangerSetting" onClick={onDeleteTasks} disabled={taskCount === 0}>
          <Trash2 size={19} />
          全タスク削除
        </button>
        <button className="dangerSetting" onClick={onDeleteMemos} disabled={memoCount === 0}>
          <Trash2 size={19} />
          全メモ削除
        </button>
        <button className="dangerSetting" onClick={onDeleteAll} disabled={taskCount + memoCount === 0}>
          <Trash2 size={19} />
          全データ削除
        </button>
      </div>
      <p className="settingsNote">現在: タスク {taskCount}件 / メモ {memoCount}件</p>
    </main>
  );
}

function BottomTabs({ activeTab, onSwitch }) {
  const tabs = [
    { id: 'tasks', label: 'タスク', icon: ListChecks },
    { id: 'memos', label: 'メモ', icon: FileText },
    { id: 'settings', label: '設定', icon: Settings },
  ];
  return (
    <nav className="bottomTabs" aria-label="下部タブ">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => onSwitch(tab.id)}>
            <Icon size={21} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

createRoot(document.getElementById('root')).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });
}
