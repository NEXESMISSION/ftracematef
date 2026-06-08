// Insights panel: Survey (post-trace demographics — age + what they want to
// draw), extracted from the AdminDashboard.jsx monolith. No cross-deps.
import { useState, useEffect, useMemo } from 'react';
import { PLAN_LABEL } from '../../lib/plans.js';
import { formatDuration } from '../../lib/traceStats.js';
import { formatRelative } from './adminLib.js';

/* ─────────────────────────────────────────────────────────────────────── */
/* Survey — post-trace demographics (age + what they want to draw). */

const SURVEY_AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45+'];
const SURVEY_AGE_LABEL = {
  '13-17': '13–17',
  '18-24': '18–24',
  '25-34': '25–34',
  '35-44': '35–44',
  '45+':   '45+',
};

// Draw categories — order is display order in the breakdown. Mirrors the
// record_survey whitelist + the ExitSurvey chip list.
const SURVEY_DRAW_ORDER = [
  'anime', 'characters', 'animals', 'portraits',
  'tattoos', 'nature', 'lettering', 'fanart', 'other',
];
const SURVEY_DRAW_LABEL = {
  anime:      { label: 'Anime / manga', emoji: '🌸' },
  characters: { label: 'Characters',    emoji: '🦸' },
  animals:    { label: 'Animals',       emoji: '🐾' },
  portraits:  { label: 'Portraits',     emoji: '🙂' },
  tattoos:    { label: 'Tattoos',       emoji: '🖤' },
  nature:     { label: 'Nature',        emoji: '🌿' },
  lettering:  { label: 'Lettering',     emoji: '✍️' },
  fanart:     { label: 'Fan art',       emoji: '⭐' },
  other:      { label: 'A bit of all',  emoji: '✨' },
};
const labelForAge  = (id) => SURVEY_AGE_LABEL[id] ?? id;
const labelForDraw = (id) => SURVEY_DRAW_LABEL[id]?.label ?? id;
const emojiForDraw = (id) => SURVEY_DRAW_LABEL[id]?.emoji ?? '✨';

// Friendly labels for the source IDs the client sends (mirrored in the
// record_exit_survey whitelist). Anything not listed here falls back to
// the raw id — happens for legacy values or migrations that lag the UI.
const SURVEY_SOURCE_LABEL = {
  ai:        'AI assistant',
  tiktok:    'TikTok',
  instagram: 'Instagram',
  youtube:   'YouTube',
  reddit:    'Reddit',
  twitter:   'X / Twitter',
  facebook:  'Facebook',
  pinterest: 'Pinterest',
  threads:   'Threads',
  linkedin:  'LinkedIn',
  discord:   'Discord',
  google:    'Search engine',
  blog:      'Blog / article',
  podcast:   'Podcast',
  app_store: 'App store',
  friend:    'A friend',
  other:     'Somewhere else',
};
const labelForSource = (id) => SURVEY_SOURCE_LABEL[id] ?? id;

export function SurveyPanel({ users, onPickUser }) {
  // Filter state for the respondents list. 'all' = every respondent; an age
  // bucket or a draw category narrows down. Recomputed cheaply alongside the
  // rollup.
  const [filter, setFilter] = useState('all');
  // Incremental rendering — only mount a page of respondent cards at a time.
  const RESP_PAGE = 20;
  const [respShown, setRespShown] = useState(RESP_PAGE);
  useEffect(() => { setRespShown(RESP_PAGE); }, [filter]);

  const { ageRows, drawRows, totals, respondents } = useMemo(() => {
    if (!Array.isArray(users)) {
      return { ageRows: [], drawRows: [], totals: { responses: 0, eligible: 0 }, respondents: [] };
    }
    // Eligible = users who have traced at least once and therefore had the
    // chance to see the post-trace survey (it gates on trace_sessions >= 1).
    // Total users isn't the right denominator — ghosts who never opened
    // /trace genuinely never saw the gate.
    let eligible = 0;
    let responses = 0;
    const byAge = Object.fromEntries(SURVEY_AGE_ORDER.map((a) => [a, 0]));
    const byDraw = Object.fromEntries(SURVEY_DRAW_ORDER.map((d) => [d, 0]));
    const respondentList = [];

    for (const u of users) {
      if (Number(u?.trace_sessions ?? 0) >= 1) eligible += 1;
      if (!u?.survey_completed_at) continue;
      responses += 1;

      const age = (u.survey_age || '').trim();
      if (age in byAge) byAge[age] += 1;

      const draws = Array.isArray(u.survey_draws) ? u.survey_draws : [];
      for (const d of draws) {
        if (d in byDraw) byDraw[d] += 1;
      }

      respondentList.push({
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        plan: u.plan ?? null,
        is_paid: !!u.is_paid,
        trace_sessions: u.trace_sessions ?? 0,
        total_trace_seconds: u.total_trace_seconds ?? 0,
        signup_source: u.signup_source ?? null,
        age,
        draws,
        note: typeof u.survey_note === 'string' ? u.survey_note.trim() : '',
        at: u.survey_completed_at,
      });
    }

    // Newest first — fresh answers are the most actionable.
    respondentList.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const ages = SURVEY_AGE_ORDER
      .map((id) => ({ id, count: byAge[id] }))
      .filter((r) => r.count > 0);
    const draws = SURVEY_DRAW_ORDER
      .map((id) => ({ id, count: byDraw[id] }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      ageRows: ages,
      drawRows: draws,
      totals: { responses, eligible, byAge, byDraw },
      respondents: respondentList,
    };
  }, [users]);

  const responseRate = totals.eligible > 0
    ? Math.round((totals.responses / totals.eligible) * 100)
    : 0;

  const filteredRespondents = useMemo(() => {
    if (filter === 'all') return respondents;
    if (filter.startsWith('age:')) {
      const a = filter.slice(4);
      return respondents.filter((r) => r.age === a);
    }
    if (filter.startsWith('draw:')) {
      const d = filter.slice(5);
      return respondents.filter((r) => r.draws.includes(d));
    }
    return respondents;
  }, [respondents, filter]);

  const maxDraw = drawRows.length > 0 ? drawRows[0].count : 0;

  return (
    <section className="admin-stats" aria-labelledby="admin-survey-title">
      <header className="admin-stats-head">
        <h2 id="admin-survey-title">Post-trace survey</h2>
        <span className="admin-stats-when">
          one-time gate shown after a user's first trace. Age + what they like
          to draw — read the audience and steer which packs and references to
          build next.
        </span>
      </header>

      {totals.responses === 0 ? (
        <div className="admin-stats-empty" style={{ padding: 16 }}>
          No survey responses yet — the gate fires the next time a user opens
          /trace after their first trace.
        </div>
      ) : (
        <>
          <div className="admin-survey-summary">
            <div className="admin-survey-summary-cell">
              <span className="admin-survey-summary-num">{totals.responses}</span>
              <span className="admin-survey-summary-lbl">responses</span>
            </div>
            <div className="admin-survey-summary-cell">
              <span className="admin-survey-summary-num">{responseRate}%</span>
              <span className="admin-survey-summary-lbl">
                of {totals.eligible} eligible
              </span>
            </div>
            {ageRows.map((r) => {
              const pct = totals.responses > 0
                ? Math.round((r.count / totals.responses) * 100)
                : 0;
              return (
                <div key={r.id} className="admin-survey-summary-cell">
                  <span className="admin-survey-summary-num">{r.count}</span>
                  <span className="admin-survey-summary-lbl">{labelForAge(r.id)} · {pct}%</span>
                </div>
              );
            })}
          </div>

          <h3 className="admin-survey-section-title">What they like to draw</h3>
          <div className="admin-acq-table" role="table">
            <div className="admin-acq-row admin-acq-head" role="row">
              <span role="columnheader">Category</span>
              <span role="columnheader">Picks</span>
              <span role="columnheader">Share of respondents</span>
            </div>
            {drawRows.map((r) => {
              const pct = totals.responses > 0
                ? Math.round((r.count / totals.responses) * 100)
                : 0;
              const barPct = maxDraw > 0 ? Math.round((r.count / maxDraw) * 100) : 0;
              return (
                <div key={r.id} className="admin-acq-row" role="row">
                  <span className="admin-acq-source" role="cell">
                    <span aria-hidden="true">{emojiForDraw(r.id)}</span> {labelForDraw(r.id)}
                  </span>
                  <span role="cell">{r.count}</span>
                  <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        height: 8,
                        width: `${barPct}%`,
                        minWidth: 2,
                        borderRadius: 4,
                        background: 'var(--coral, #e87a7a)',
                      }}
                    />
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="admin-survey-respondents-head">
            <h3 className="admin-survey-section-title">
              Respondents <span className="admin-survey-section-count">{filteredRespondents.length}</span>
            </h3>
            <div className="admin-survey-filter-tabs" role="tablist" aria-label="Filter respondents">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={`admin-survey-filter-tab ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All <span className="admin-survey-filter-count">{respondents.length}</span>
              </button>
              {ageRows.map((r) => (
                <button
                  key={`age:${r.id}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === `age:${r.id}`}
                  className={`admin-survey-filter-tab ${filter === `age:${r.id}` ? 'is-active' : ''}`}
                  onClick={() => setFilter(`age:${r.id}`)}
                >
                  {labelForAge(r.id)} <span className="admin-survey-filter-count">{r.count}</span>
                </button>
              ))}
              {drawRows.map((r) => (
                <button
                  key={`draw:${r.id}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === `draw:${r.id}`}
                  className={`admin-survey-filter-tab ${filter === `draw:${r.id}` ? 'is-active' : ''}`}
                  onClick={() => setFilter(`draw:${r.id}`)}
                >
                  {emojiForDraw(r.id)} {labelForDraw(r.id)} <span className="admin-survey-filter-count">{r.count}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="admin-survey-respondents">
            {filteredRespondents.slice(0, respShown).map((r) => {
              const planLabel = r.is_paid && r.plan
                ? PLAN_LABEL[r.plan] ?? r.plan
                : (r.plan === 'free' || !r.plan ? 'Free' : (PLAN_LABEL[r.plan] ?? r.plan));
              const planTone = r.is_paid ? 'paid' : 'free';
              return (
                <li key={r.id} className="admin-survey-respondent">
                  <div className="admin-survey-respondent-head">
                    <span className="admin-survey-respondent-feeling" aria-hidden="true">
                      {r.draws.length > 0 ? emojiForDraw(r.draws[0]) : '✨'}
                    </span>
                    <button
                      type="button"
                      className="admin-survey-respondent-who"
                      onClick={() => onPickUser?.(r.id)}
                      title={r.email || ''}
                    >
                      {r.display_name || (r.email ? r.email.split('@')[0] : 'unknown')}
                    </button>
                    <span className={`admin-survey-respondent-plan admin-survey-respondent-plan-${planTone}`}>
                      {planLabel}
                    </span>
                    <span className="admin-survey-respondent-meta">
                      <strong>{r.age ? labelForAge(r.age) : 'age n/a'}</strong>
                      {' · '}
                      {formatRelative(r.at)}
                    </span>
                  </div>
                  <div className="admin-survey-respondent-sub">
                    <span className="admin-survey-respondent-email" title={r.email || ''}>
                      {r.email || '—'}
                    </span>
                    <span className="admin-survey-respondent-stats">
                      {r.trace_sessions} {r.trace_sessions === 1 ? 'session' : 'sessions'}
                      {r.total_trace_seconds > 0 && ` · ${formatDuration(r.total_trace_seconds)} traced`}
                      {r.signup_source && ` · first-touch: ${labelForSource(r.signup_source)}`}
                    </span>
                  </div>
                  {r.draws.length > 0 && (
                    <p className="admin-survey-respondent-note">
                      Draws: {r.draws.map(labelForDraw).join(', ')}
                    </p>
                  )}
                  {r.note && (
                    <p className="admin-survey-respondent-note admin-survey-respondent-note-said">
                      <span className="admin-survey-respondent-note-tag">Note</span>
                      "{r.note}"
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {filteredRespondents.length > respShown && (
            <div className="admin-loadmore">
              <button
                type="button"
                className="admin-loadmore-btn"
                onClick={() => setRespShown((c) => c + RESP_PAGE)}
              >
                Load {Math.min(RESP_PAGE, filteredRespondents.length - respShown)} more
              </button>
              <span className="admin-loadmore-meta">
                Showing {Math.min(respShown, filteredRespondents.length)} of {filteredRespondents.length}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Webhook health — stuck-event count + recent list. Mounted above the
   tab nav so anything stuck for >24h is impossible to miss regardless of
   which tab the operator is currently on.                                */

