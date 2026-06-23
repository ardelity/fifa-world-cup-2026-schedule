// Sidecar: periodically fetches the fixture feed, applies the same transform +
// enrichment as the build-time pipeline (README "Refreshing data", add_locations.mjs,
// add_broadcasters.mjs) and atomically writes /data/matches.json for nginx to serve.
// On any error the current file is left untouched — the site keeps serving stale data.
import { writeFileSync, renameSync, readFileSync, existsSync } from 'fs';

const FEED_URL = process.env.FEED_URL || 'https://fixturedownload.com/feed/json/fifa-world-cup-2026';
const OUT_FILE = process.env.OUT_FILE || '/data/matches.json';
// Ranked list of the third-placed teams (one per group), best first — written next
// to matches.json so the site can show which "best thirds" currently qualify.
const THIRDS_FILE = process.env.THIRDS_FILE || OUT_FILE.replace(/matches\.json$/, 'best-thirds.json');
// Round-of-32 bracket projected from the current standings.
const BRACKET_FILE = process.env.BRACKET_FILE || OUT_FILE.replace(/matches\.json$/, 'bracket.json');
// Bracket as it would have looked after each played match — powers the site's game-by-game scrubber.
const HISTORY_FILE = process.env.HISTORY_FILE || OUT_FILE.replace(/matches\.json$/, 'bracket-history.json');
const INTERVAL_MS = (parseInt(process.env.INTERVAL_SECONDS, 10) || 900) * 1000;
// The tournament ends with the final on 2026-07-19; results are final after that. Stop
// hitting the feed once the 21st has passed — further requests are pointless. ISO date,
// overridable via STOP_AFTER. The last polled instant is the end of 2026-07-21 (UTC).
const STOP_AFTER = new Date(process.env.STOP_AFTER || '2026-07-21T23:59:59Z');

// FIFA's Annex C table: for each of the 495 combinations of the eight qualifying
// third-placed groups (key = the 8 group letters sorted), which group's third goes
// to each round-of-32 match. Parsed from the published regulations. { "<combo>": { "<matchNo>": "<group>" } }
const THIRD_ALLOCATIONS = JSON.parse(readFileSync(new URL('./third-place-allocations.json', import.meta.url), 'utf8'));

// Fixed knockout bracket past the round of 32: which earlier matches feed each
// match (matches 89–104), as [home, away] where W=winner, L=loser. From the
// published tournament bracket. Round-of-32 (73–88) slots come from the group stage.
const PROGRESSION = {
  89: ['W74', 'W77'], 90: ['W73', 'W75'], 91: ['W76', 'W78'], 92: ['W79', 'W80'],
  93: ['W83', 'W84'], 94: ['W81', 'W82'], 95: ['W86', 'W88'], 96: ['W85', 'W87'],
  97: ['W89', 'W90'], 98: ['W93', 'W94'], 99: ['W91', 'W92'], 100: ['W95', 'W96'],
  101: ['W97', 'W98'], 102: ['W99', 'W100'], 103: ['L101', 'L102'], 104: ['W101', 'W102'],
};
const roundName = (n) =>
  n <= 88 ? 'Round of 32' : n <= 96 ? 'Round of 16' : n <= 100 ? 'Quarter-final'
  : n <= 102 ? 'Semi-final' : n === 103 ? 'Match for third place' : 'Final';

// FIFA's sanitized venue names -> real stadium + host city (mirror of add_locations.mjs)
const VENUES = {
  'Atlanta Stadium':                { stadium: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA' },
  'BC Place Vancouver':             { stadium: 'BC Place', city: 'Vancouver', country: 'Canada' },
  'Boston Stadium':                 { stadium: 'Gillette Stadium', city: 'Boston (Foxborough)', country: 'USA' },
  'Dallas Stadium':                 { stadium: 'AT&T Stadium', city: 'Dallas (Arlington)', country: 'USA' },
  'Guadalajara Stadium':            { stadium: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico' },
  'Houston Stadium':                { stadium: 'NRG Stadium', city: 'Houston', country: 'USA' },
  'Kansas City Stadium':            { stadium: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA' },
  'Los Angeles Stadium':            { stadium: 'SoFi Stadium', city: 'Los Angeles (Inglewood)', country: 'USA' },
  'Mexico City Stadium':            { stadium: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico' },
  'Miami Stadium':                  { stadium: 'Hard Rock Stadium', city: 'Miami', country: 'USA' },
  'Monterrey Stadium':              { stadium: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico' },
  'New York/New Jersey Stadium':    { stadium: 'MetLife Stadium', city: 'New York/New Jersey (East Rutherford)', country: 'USA' },
  'Philadelphia Stadium':           { stadium: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA' },
  'San Francisco Bay Area Stadium': { stadium: "Levi's Stadium", city: 'San Francisco Bay Area (Santa Clara)', country: 'USA' },
  'Seattle Stadium':                { stadium: 'Lumen Field', city: 'Seattle', country: 'USA' },
  'Toronto Stadium':                { stadium: 'BMO Field', city: 'Toronto', country: 'Canada' },
};

// Swedish broadcaster listing (svenskfotboll.se, May 2026) — mirror of add_broadcasters.mjs.
// Knockout channels are unannounced; those matches get broadcaster: null.
const SV = {
  'Mexiko': 'Mexico', 'Sydafrika': 'South Africa', 'Sydkorea': 'Korea Republic',
  'Tjeckien': 'Czechia', 'Kanada': 'Canada', 'Bosnien-Hercegovina': 'Bosnia and Herzegovina',
  'Bosnien och Hercegovina': 'Bosnia and Herzegovina', 'USA': 'USA', 'Paraguay': 'Paraguay',
  'Qatar': 'Qatar', 'Schweiz': 'Switzerland', 'Brasilien': 'Brazil', 'Marocko': 'Morocco',
  'Haiti': 'Haiti', 'Skottland': 'Scotland', 'Australien': 'Australia', 'Turkiet': 'Türkiye',
  'Tyskland': 'Germany', 'Curacao': 'Curaçao', 'Nederländerna': 'Netherlands', 'Japan': 'Japan',
  'Sverige': 'Sweden', 'Tunisien': 'Tunisia', 'Spanien': 'Spain', 'Kap Verde': 'Cabo Verde',
  'Belgien': 'Belgium', 'Egypten': 'Egypt', 'Elfbenskusten': "Côte d'Ivoire",
  'Elfenbenskusten': "Côte d'Ivoire", 'Ecuador': 'Ecuador', 'Saudiarabien': 'Saudi Arabia',
  'Uruguay': 'Uruguay', 'Iran': 'IR Iran', 'Nya Zeeland': 'New Zealand', 'Frankrike': 'France',
  'Senegal': 'Senegal', 'Irak': 'Iraq', 'Norge': 'Norway', 'Argentina': 'Argentina',
  'Algeriet': 'Algeria', 'Österrike': 'Austria', 'Jordanien': 'Jordan', 'Portugal': 'Portugal',
  'DR Kongo': 'Congo DR', 'England': 'England', 'Kroatien': 'Croatia', 'Ghana': 'Ghana',
  'Panama': 'Panama', 'Uzbekistan': 'Uzbekistan', 'Colombia': 'Colombia',
};

const LISTING = `
Mexiko - Sydafrika | TV4
Sydkorea - Tjeckien | TV4
Kanada - Bosnien-Hercegovina | SVT1
USA - Paraguay | TV4
Qatar - Schweiz | TV4
Brasilien - Marocko | SVT1
Haiti - Skottland | SVT1
Australien - Turkiet | TV4
Tyskland - Curacao | TV4
Nederländerna - Japan | TV4
Sverige - Tunisien | SVT1
Spanien - Kap Verde | SVT1
Belgien - Egypten | SVT1/SVT2
Elfbenskusten - Ecuador | TV4
Saudiarabien - Uruguay | TV4
Iran - Nya Zeeland | TV4
Frankrike - Senegal | SVT1
Irak - Norge | TV4
Argentina - Algeriet | TV4
Österrike - Jordanien | TV4
Portugal - DR Kongo | TV4
England - Kroatien | TV4
Ghana - Panama | TV4
Uzbekistan - Colombia | TV4
Tjeckien - Sydafrika | TV4
Schweiz - Bosnien och Hercegovina | TV4
Kanada - Qatar | TV4
Mexiko - Sydkorea | TV4
USA - Australien | SVT2
Skottland - Marocko | SVT1
Brasilien - Haiti | TV4
Turkiet - Paraguay | TV4
Nederländerna - Sverige | TV4
Tyskland - Elfbenskusten | TV4
Ecuador - Curacao | TV4
Tunisien - Japan | SVT1
Spanien - Saudiarabien | TV4
Belgien - Iran | TV4
Uruguay - Kap Verde | TV4
Nya Zeeland - Egypten | TV4
Argentina - Österrike | SVT2/SVT1
Frankrike - Irak | SVT1
Norge - Senegal | SVT1
Jordanien - Algeriet | TV4
Portugal - Uzbekistan | SVT2/SVT1
England - Ghana | SVT1
Panama - Kroatien | TV4
Colombia - DR Kongo | TV4
Schweiz - Kanada | TV4
Bosnien och Hercegovina - Qatar | TV4
Marocko - Haiti | TV4
Skottland - Brasilien | TV4
Sydafrika - Sydkorea | SVT2
Tjeckien - Mexiko | SVT1
Curacao - Elfenbenskusten | SVT1
Ecuador - Tyskland | SVT1
Tunisien - Nederländerna | SVT2
Japan - Sverige | SVT1
Turkiet - USA | TV4
Paraguay - Australien | TV4
Norge - Frankrike | TV4
Senegal - Irak | TV4
Kap Verde - Saudiarabien | TV4
Uruguay - Spanien | TV4
Nya Zeeland - Belgien | TV4
Egypten - Iran | TV4
Panama - England | SVT1
Kroatien - Ghana | SVT2
DR Kongo - Uzbekistan | TV4
Colombia - Portugal | TV4
Algeriet - Österrike | TV4
Jordanien - Argentina | TV4
`.trim().split('\n');

const channelByPair = new Map();
for (const line of LISTING) {
  const [teams, channel] = line.split('|').map(s => s.trim());
  const [home, away] = teams.split(' - ').map(s => s.trim());
  if (!(home in SV) || !(away in SV)) throw new Error(`Unknown Swedish team name in listing: ${line}`);
  channelByPair.set(`${SV[home]}|${SV[away]}`, channel);
}

function transform(raw) {
  const matches = raw.map(f => {
    const v = VENUES[f.Location];
    if (!v) throw new Error(`Unmapped venue: ${f.Location}`);
    const dt = new Date(f.DateUtc.replace(' ', 'T'));
    if (isNaN(dt)) throw new Error(`Bad DateUtc: ${f.DateUtc}`);
    const broadcaster = f.MatchNumber <= 72
      ? (channelByPair.get(`${f.HomeTeam}|${f.AwayTeam}`)
         ?? channelByPair.get(`${f.AwayTeam}|${f.HomeTeam}`)
         ?? null)
      : null;
    return {
      matchNumber: f.MatchNumber,
      dateUtc: dt.toISOString().replace('.000Z', 'Z'),
      homeTeam: f.HomeTeam,
      awayTeam: f.AwayTeam,
      group: f.Group,
      location: f.Location,
      homeScore: f.HomeTeamScore,
      awayScore: f.AwayTeamScore,
      broadcaster,
      stadium: v.stadium,
      city: v.city,
      country: v.country,
    };
  });
  matches.sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.matchNumber - b.matchNumber);
  return matches;
}

// Build a group table from its matches. Every team that appears is listed (even
// before kickoff); only matches with both scores recorded count toward the stats.
function buildTable(groupMatches) {
  const table = new Map();
  const row = name => {
    if (!table.has(name)) {
      table.set(name, { team: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 });
    }
    return table.get(name);
  };
  for (const m of groupMatches) {
    const h = row(m.homeTeam), a = row(m.awayTeam);
    if (m.homeScore === null || m.awayScore === null) continue;
    h.played++; a.played++;
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.points += 3; }
    else if (m.homeScore < m.awayScore) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  for (const t of table.values()) t.goalDiff = t.goalsFor - t.goalsAgainst;
  return table;
}

// FIFA group order: points, then goal difference, then goals for. Teams still tied
// on all three are split by head-to-head (a mini-table of only the matches between
// them), then by team name as a deterministic last resort.
function rankGroup(groupMatches) {
  const teams = [...buildTable(groupMatches).values()];
  const tiedOnOverall = (a, b) => a.points === b.points && a.goalDiff === b.goalDiff && a.goalsFor === b.goalsFor;
  teams.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team));
  for (let i = 0; i < teams.length;) {
    let j = i + 1;
    while (j < teams.length && tiedOnOverall(teams[i], teams[j])) j++;
    if (j - i > 1) {
      const names = new Set(teams.slice(i, j).map(t => t.team));
      const h2h = buildTable(groupMatches.filter(m => names.has(m.homeTeam) && names.has(m.awayTeam)));
      const tied = teams.slice(i, j).sort((a, b) => {
        const x = h2h.get(a.team), y = h2h.get(b.team);
        return y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor || a.team.localeCompare(b.team);
      });
      teams.splice(i, tied.length, ...tied);
    }
    i = j;
  }
  return teams;
}

// Ranked standings for every group, keyed by its full name ("Group A".."Group L").
function standingsByGroup(matches) {
  const groups = new Map();
  for (const m of matches) {
    if (!m.group) continue; // skip knockout fixtures
    (groups.get(m.group) ?? groups.set(m.group, []).get(m.group)).push(m);
  }
  const standings = new Map();
  for (const [group, groupMatches] of groups) standings.set(group, rankGroup(groupMatches));
  return standings;
}

// One third-placed team per group, ranked best first by 1) points, 2) goal
// difference, 3) goals scored. The eight best qualify; their group letters, sorted
// alphabetically (e.g. "ABDEFGJK"), are the key FIFA uses to set the round-of-32 bracket.
function bestThirds(standings) {
  let thirds = [];
  for (const [group, ranked] of standings) {
    const third = ranked[2];
    if (third) thirds.push({ group, ...third });
  }
  thirds.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.group.localeCompare(b.group));
  thirds = thirds.map((t, i) => ({ rank: i + 1, qualifies: i < 8, ...t }));
  const qualifiedGroups = thirds
    .filter(t => t.qualifies)
    .map(t => t.group.replace('Group ', ''))
    .sort()
    .join('');
  return { qualifiedGroups, thirds };
}

// Project the full knockout bracket (matches 73–104) from the current standings.
// Round of 32: group winners/runners-up sit in their fixed feed slots (1A, 2C, …)
// and each third-place slot (3ABCDF, …) is filled via the Annex C allocation for
// the qualifying combination. Later rounds carry the fixed Winner/Loser-of-match
// linkage until the feed resolves a slot to a real team.
function buildBracket(matches, standings, qualifiedGroups) {
  const alloc = THIRD_ALLOCATIONS[qualifiedGroups]; // matchNo -> group letter (undefined until 8 thirds settle)
  const teamAt = (group, idx) => standings.get(`Group ${group}`)?.[idx]?.team ?? null;
  const resolve = (slot, matchNumber, side) => {
    let m;
    if ((m = slot.match(/^([12])([A-L])$/)))                 // 1A / 2C — group winner / runner-up
      return { slot, position: +m[1], group: m[2], team: teamAt(m[2], +m[1] - 1) };
    if ((m = slot.match(/^3([A-L]{2,})$/))) {                // 3ABCDF — one of the qualifying thirds
      const group = alloc?.[matchNumber] ?? null;
      return { slot, position: 3, eligibleGroups: m[1], group, team: group ? teamAt(group, 2) : null };
    }
    const prog = PROGRESSION[matchNumber];                   // later rounds: winner/loser of an earlier match
    if (prog && /to be announced/i.test(slot)) {
      const ref = prog[side];
      return { sourceType: ref[0] === 'W' ? 'winner' : 'loser', sourceMatch: +ref.slice(1), team: null };
    }
    // The feed replaces a placeholder with the real name once that slot is officially
    // settled; treat any non-placeholder string as the authoritative resolved team.
    return { slot, team: slot, resolved: true };
  };
  const bracket = matches
    .filter(m => m.matchNumber >= 73)
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map(m => ({
      matchNumber: m.matchNumber,
      round: roundName(m.matchNumber),
      dateUtc: m.dateUtc,
      stadium: m.stadium,
      city: m.city,
      country: m.country,
      home: resolve(m.homeTeam, m.matchNumber, 0),
      away: resolve(m.awayTeam, m.matchNumber, 1),
    }));
  return { combination: qualifiedGroups, bracket };
}

// For each played match (by ascending match number), the bracket as it would have looked
// using only results up to and including that match — feeds the site's forward/back scrubber.
// Snapshots are slim (per-match home/away resolution only); the site fills dates/venues from
// matches.json and recomputes the thirds panel from the same "as of" results.
function buildHistory(matches) {
  // Order games as actually played — kickoff time, then match number as a tiebreak — so the
  // scrubber reads "game 1, 2, 3 …" chronologically rather than by the gappy official numbers.
  const order = [...matches].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || a.matchNumber - b.matchNumber);
  const pos = new Map(order.map((m, i) => [m.matchNumber, i]));
  const played = order.filter(m => m.homeScore !== null && m.awayScore !== null);
  const snapshots = played.map((gm, i) => {
    // Results known up to and including this game; everything later in the schedule is blanked.
    const cutoff = pos.get(gm.matchNumber);
    const asOf = matches.map(m => pos.get(m.matchNumber) <= cutoff ? m : { ...m, homeScore: null, awayScore: null });
    const standings = standingsByGroup(asOf);
    const { qualifiedGroups } = bestThirds(standings);
    const { bracket } = buildBracket(asOf, standings, qualifiedGroups);
    return { seq: i + 1, game: gm.matchNumber, combination: qualifiedGroups, bracket: bracket.map(b => ({ matchNumber: b.matchNumber, home: b.home, away: b.away })) };
  });
  return { latestGame: snapshots.length, count: snapshots.length, snapshots };
}

// tmp + rename = atomic on the same volume; nginx never sees a half-written file.
// Returns false when the content is unchanged so callers can log a quiet no-op.
function writeIfChanged(file, json, label) {
  if (existsSync(file) && readFileSync(file, 'utf8') === json) {
    console.log(`${new Date().toISOString()} no changes (${label})`);
    return false;
  }
  writeFileSync(file + '.tmp', json);
  renameSync(file + '.tmp', file);
  console.log(`${new Date().toISOString()} updated ${file} — ${label}`);
  return true;
}

async function refresh() {
  const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'wc2026-site-updater' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Feed responded HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length < 100) throw new Error(`Unexpected feed shape: ${Array.isArray(raw) ? raw.length + ' entries' : typeof raw}`);

  const matches = transform(raw);
  const played = matches.filter(m => m.homeScore !== null && m.awayScore !== null).length;
  writeIfChanged(OUT_FILE, JSON.stringify(matches, null, 2), `${matches.length} matches, ${played} played`);

  const standings = standingsByGroup(matches);
  const thirds = bestThirds(standings);
  writeIfChanged(THIRDS_FILE, JSON.stringify(thirds, null, 2), `best thirds: ${thirds.qualifiedGroups || '(none yet)'}`);

  const bracket = buildBracket(matches, standings, thirds.qualifiedGroups);
  writeIfChanged(BRACKET_FILE, JSON.stringify(bracket, null, 2), `knockout bracket (${bracket.bracket.length} matches, thirds: ${thirds.qualifiedGroups || 'pending'})`);

  const history = buildHistory(matches);
  writeIfChanged(HISTORY_FILE, JSON.stringify(history), `bracket history (${history.count} snapshots, latest G${history.latestGame ?? '-'})`);
}

let timer = null;
async function tick() {
  if (new Date() > STOP_AFTER) {
    console.log(`${new Date().toISOString()} past ${STOP_AFTER.toISOString()} — tournament complete, no further updates`);
    if (timer) clearInterval(timer);
    return;
  }
  try {
    await refresh();
  } catch (err) {
    console.error(`${new Date().toISOString()} refresh failed (keeping previous data): ${err.message}`);
  }
}

console.log(`wc2026 updater: ${FEED_URL} -> ${OUT_FILE} every ${INTERVAL_MS / 1000}s (until ${STOP_AFTER.toISOString()})`);
await tick();
if (process.env.RUN_ONCE) process.exit(0);
if (new Date() <= STOP_AFTER) timer = setInterval(tick, INTERVAL_MS);
