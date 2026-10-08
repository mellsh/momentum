'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const EMOJIS = ['💧', '💊', '🏃', '📚', '🧘', '😴', '🥗', '✍️'];
const TOKEN_KEY = 'momentum_google_token';

// 로컬 날짜를 YYYY-MM-DD 로
const key = (d) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
// 오늘(또는 어제)부터 거꾸로 이어진 연속 성공 일수
const calcStreak = (set) => {
  const d = new Date();
  if (!set.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(key(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
};
const lastDays = (n) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return key(d);
  });

// Google Calendar API 호출 helper
async function gcal(path, token, opts = {}) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/' + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  if (res.status === 401) throw new Error('EXPIRED');
  if (res.status === 204 || res.status === 410) return null;
  if (!res.ok) throw new Error('CAL_' + res.status);
  return res.json();
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const apply = (s) => {
      setUser(s?.user ?? null);
      if (s?.provider_token) {
        localStorage.setItem(TOKEN_KEY, s.provider_token);
        setToken(s.provider_token);
      } else {
        setToken(s ? localStorage.getItem(TOKEN_KEY) : null);
      }
    };
    supabase.auth.getSession().then(({ data }) => { apply(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => apply(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: SCOPE,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });

  if (!ready) return <div className="center">불러오는 중…</div>;
  if (!user)
    return (
      <div className="center login">
        <div className="flame">🔥</div>
        <h1>Momentum</h1>
        <p className="lead">하루 한 번 체크하면 연속 기록이 쌓여요.<br />끊기지 않게, 캘린더가 대신 알려 줍니다.</p>
        <button className="primary" onClick={login}>Google로 시작하기</button>
      </div>
    );
  return <Dashboard user={user} token={token} relogin={login} />;
}

function Dashboard({ user, token, relogin }) {
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState({});
  const [events, setEvents] = useState([]);
  const [calErr, setCalErr] = useState('');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💧');
  const [time, setTime] = useState('09:00');
  const [addCal, setAddCal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = key(new Date());

  const load = useCallback(async () => {
    const [h, l] = await Promise.all([
      supabase.from('habits').select('*').order('created_at'),
      supabase.from('habit_logs').select('habit_id,log_date').gte('log_date', lastDays(120)[0]),
    ]);
    const m = {};
    (l.data || []).forEach((r) => {
      if (!m[r.habit_id]) m[r.habit_id] = new Set();
      m[r.habit_id].add(r.log_date);
    });
    setLogs(m);
    setHabits(h.data || []);
    setLoading(false);
  }, []);

  const loadEvents = useCallback(async () => {
    if (!token) { setCalErr('EXPIRED'); return; }
    try {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setDate(e.getDate() + 1);
      const r = await gcal(
        'events?singleEvents=true&orderBy=startTime&timeMin=' + encodeURIComponent(s.toISOString()) +
          '&timeMax=' + encodeURIComponent(e.toISOString()),
        token
      );
      setEvents(r?.items || []);
      setCalErr('');
    } catch (ex) { setCalErr(ex.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  const addHabit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    let ev = null;
    if (addCal) {
      try {
        const [h, m] = time.split(':').map(Number);
        const endMin = Math.min(h * 60 + m + 30, 1439);
        const end = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        ev = await gcal('events', token, {
          method: 'POST',
          body: JSON.stringify({
            summary: emoji + ' ' + name.trim(),
            description: 'Momentum 습관 — 오늘도 체크하세요!',
            start: { dateTime: today + 'T' + time + ':00', timeZone: tz },
            end: { dateTime: today + 'T' + end + ':00', timeZone: tz },
            recurrence: ['RRULE:FREQ=DAILY'],
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
          }),
        });
      } catch (ex) {
        setCalErr(ex.message);
        alert('캘린더에 등록하지 못해서 습관만 저장할게요. (Google로 다시 로그인하면 해결될 수 있어요)');
      }
    }
    const { error } = await supabase.from('habits').insert({
      name: name.trim(), emoji, remind_time: time,
      calendar_event_id: ev?.id || null, calendar_link: ev?.htmlLink || null,
    });
    if (error) alert('저장하지 못했어요: ' + error.message);
    setName('');
    setBusy(false);
    await load();
    loadEvents();
  };

  const toggle = async (h) => {
    const set = new Set(logs[h.id] || []);
    if (set.has(today)) {
      await supabase.from('habit_logs').delete().eq('habit_id', h.id).eq('log_date', today);
      set.delete(today);
    } else {
      await supabase.from('habit_logs').insert({ habit_id: h.id, log_date: today });
      set.add(today);
    }
    const cur = calcStreak(set);
    await supabase.from('habits')
      .update({ current_streak: cur, best_streak: Math.max(h.best_streak, cur) })
      .eq('id', h.id);
    load();
  };

  const del = async (h) => {
    if (!confirm(`'${h.name}' 습관을 삭제할까요? 기록도 함께 사라져요.`)) return;
    if (h.calendar_event_id && token) {
      try { await gcal('events/' + h.calendar_event_id, token, { method: 'DELETE' }); } catch (ex) { /* 캘린더 삭제 실패는 무시 */ }
    }
    await supabase.from('habits').delete().eq('id', h.id);
    await load();
    loadEvents();
  };

  // 통계
  const week = lastDays(7);
  const perDay = week.map((d) => habits.filter((h) => logs[h.id]?.has(d)).length);
  const weekDone = perDay.reduce((a, b) => a + b, 0);
  const rate = habits.length ? Math.round((weekDone / (habits.length * 7)) * 100) : 0;
  const doneToday = habits.filter((h) => logs[h.id]?.has(today)).length;
  const bestNow = Math.max(0, ...habits.map((h) => calcStreak(logs[h.id] || new Set())));
  const bestEver = Math.max(0, ...habits.map((h) => h.best_streak));
  const dow = ['일', '월', '화', '수', '목', '금', '토'];

  const evTime = (ev) =>
    ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : '종일';
  const habitOfEvent = (ev) => habits.find((h) => h.calendar_event_id && (ev.recurringEventId === h.calendar_event_id || ev.id === h.calendar_event_id));

  return (
    <div className="wrap">
      <header className="top">
        <h1>Momentum</h1>
        <div className="who">
          <span>{user.user_metadata?.name || user.email}</span>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>로그아웃</button>
        </div>
      </header>

      {calErr === 'EXPIRED' && (
        <div className="notice">
          Google 캘린더 연결이 만료됐어요. 보안상 1시간마다 다시 연결해야 해요.
          <button className="primary sm" onClick={relogin}>캘린더 다시 연결</button>
        </div>
      )}
      {calErr.startsWith('CAL_') && (
        <div className="notice">캘린더를 불러오지 못했어요 ({calErr}). Google Cloud에서 Calendar API가 켜져 있는지 확인해 주세요.</div>
      )}

      <section className="hero">
        <div className="big">
          <span className="num">{bestNow}</span>
          <span className="unit">일 연속</span>
          <small>지금 가장 길게 이어지는 습관 · 역대 최고 {bestEver}일</small>
        </div>
        <div className="mini">
          <div><b>{doneToday}/{habits.length}</b><span>오늘 완료</span></div>
          <div><b>{rate}%</b><span>최근 7일 달성률</span></div>
        </div>
        <div className="bars" aria-label="최근 7일 완료 수">
          {week.map((d, i) => (
            <div key={d} className="bar">
              <i style={{ height: habits.length ? (perDay[i] / habits.length) * 100 + '%' : '0%' }} />
              <span>{dow[new Date(d + 'T00:00:00').getDay()]}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid">
        <main>
          <form className="add" onSubmit={addHabit}>
            <div className="emojis">
              {EMOJIS.map((x) => (
                <button type="button" key={x} className={x === emoji ? 'on' : ''} onClick={() => setEmoji(x)} aria-label={x}>{x}</button>
              ))}
            </div>
            <input placeholder="예: 매일 물 2L 마시기" value={name} onChange={(e) => setName(e.target.value)} required />
            <div className="addrow">
              <label>알림 시간 <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
              <label className="chk"><input type="checkbox" checked={addCal} onChange={(e) => setAddCal(e.target.checked)} /> 구글 캘린더에 매일 반복 일정 만들기</label>
              <button className="primary" disabled={busy}>{busy ? '추가 중…' : '습관 추가'}</button>
            </div>
          </form>

          {loading ? (
            <p className="empty">불러오는 중…</p>
          ) : habits.length === 0 ? (
            <p className="empty">아직 습관이 없어요. 위에서 첫 습관을 추가해 보세요.</p>
          ) : (
            habits.map((h) => {
              const set = logs[h.id] || new Set();
              const done = set.has(today);
              const cur = calcStreak(set);
              const days = lastDays(28);
              return (
                <article key={h.id} className={'habit' + (done ? ' done' : '')}>
                  <button className="check" onClick={() => toggle(h)} aria-label={done ? '오늘 체크 취소' : '오늘 체크'}>
                    {done ? '✓' : h.emoji}
                  </button>
                  <div className="info">
                    <b>{h.name}</b>
                    <span>
                      매일 {h.remind_time}
                      {h.calendar_link && <> · <a href={h.calendar_link} target="_blank" rel="noreferrer">캘린더에서 보기</a></>}
                    </span>
                    <div className="heat" aria-label="최근 28일">
                      {days.map((d) => <i key={d} className={set.has(d) ? 'on' : ''} title={d} />)}
                    </div>
                  </div>
                  <div className="streak">
                    <b>{cur}</b><span>일 연속</span>
                    <small>최고 {Math.max(h.best_streak, cur)}일</small>
                  </div>
                  <button className="x" onClick={() => del(h)} aria-label="삭제">×</button>
                </article>
              );
            })
          )}
        </main>

        <aside className="cal">
          <h2>오늘의 캘린더</h2>
          {events.length === 0 && !calErr && <p className="empty sm">오늘 일정이 없어요.</p>}
          <ul>
            {events.map((ev) => {
              const h = habitOfEvent(ev);
              return (
                <li key={ev.id} className={h ? 'mine' : ''}>
                  <time>{evTime(ev)}</time>
                  <span>{ev.summary || '(제목 없음)'}</span>
                  {h && <em>{logs[h.id]?.has(today) ? '완료 ✓' : '체크 전'}</em>}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
