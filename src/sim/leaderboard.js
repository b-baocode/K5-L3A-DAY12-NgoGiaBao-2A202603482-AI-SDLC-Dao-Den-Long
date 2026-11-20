// Local leaderboard rules (Ticket-04 §3). Pure functions, shared by the web game and scripts/run.js.
export const LEADERBOARD_SIZE = 10;
// 3-12 chars of [A-Za-z0-9_]; Vietnamese letters with diacritics are also accepted (bonus in the ticket).
const NAME_RE = /^[\p{L}\p{M}0-9_]{3,12}$/u;

export function validName(name) {
  if (typeof name !== 'string') return false;
  const n = name.normalize('NFC');
  return NAME_RE.test(n) && [...n].length >= 3 && [...n].length <= 12;
}

// ISO 8601 with the local timezone offset, e.g. 2026-11-20T15:04:05+07:00
export function isoWithOffset(date = new Date()) {
  const pad = (v) => String(Math.floor(Math.abs(v))).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

export function makeEntry({ name, score, nightsWon, seed, date = new Date() }) {
  if (!validName(name)) throw new Error('name must be 3-12 letters, digits or _');
  if (!Number.isInteger(score) || score < 0) throw new Error('score must be an integer >= 0');
  if (!Number.isInteger(nightsWon) || nightsWon < 0 || nightsWon > 3) throw new Error('nights_won must be 0..3');
  return { name: name.normalize('NFC'), score, nights_won: nightsWon, achieved_at: isoWithOffset(date), seed };
}

// score desc; equal score -> whoever achieved it first ranks higher; keep top 10
export function sortEntries(entries) {
  return [...entries]
    .sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at))
    .slice(0, LEADERBOARD_SIZE);
}

export function addEntry(entries, entry) {
  return sortEntries([...(entries || []), entry]);
}
