// Adds stadium + city to matches.json. The feed's `location` field uses FIFA's
// sanitized venue names (sponsor names stripped); this maps them to the real
// stadium names and host cities. Re-run after refreshing matches.json.
import { readFileSync, writeFileSync } from 'fs';

const FILE = new URL('matches.json', import.meta.url);

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

const matches = JSON.parse(readFileSync(FILE, 'utf8'));
const unknown = new Set();
for (const m of matches) {
  const v = VENUES[m.location];
  if (!v) { unknown.add(m.location); continue; }
  m.stadium = v.stadium;
  m.city = v.city;
  m.country = v.country;
}
if (unknown.size) throw new Error('Unmapped venues: ' + [...unknown].join(', '));

writeFileSync(FILE, JSON.stringify(matches, null, 2));
console.log(`matches.json updated — stadium + city set on ${matches.length} matches`);
