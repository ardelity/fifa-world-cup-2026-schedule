// Merges Swedish broadcaster info (source: svenskfotboll.se "Så sänder TV4 och SVT", May 2026)
// into matches.json. Knockout matches are not yet assigned a channel -> broadcaster stays null.
import { readFileSync, writeFileSync } from 'fs';

const FILE = new URL('matches.json', import.meta.url);

// Swedish name (as in the article) -> team name as used by the fixture feed
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

// "home - away | channel" exactly as published (Swedish dates omitted; team pairs are unique)
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
  if (!(home in SV)) throw new Error(`Unknown Swedish team name: ${home}`);
  if (!(away in SV)) throw new Error(`Unknown Swedish team name: ${away}`);
  const key = `${SV[home]}|${SV[away]}`;
  if (channelByPair.has(key)) throw new Error(`Duplicate pair: ${key}`);
  channelByPair.set(key, channel);
}
console.log(`Listing entries: ${channelByPair.size}`);

const matches = JSON.parse(readFileSync(FILE, 'utf8'));
let assigned = 0;
const unmatchedGroup = [];
for (const m of matches) {
  if (m.matchNumber > 72) { m.broadcaster = m.broadcaster ?? null; continue; }
  const key = `${m.homeTeam}|${m.awayTeam}`;
  const channel = channelByPair.get(key);
  if (channel) { m.broadcaster = channel; channelByPair.delete(key); assigned++; }
  else unmatchedGroup.push(`#${m.matchNumber} ${key}`);
}
console.log(`Assigned: ${assigned}/72`);
if (unmatchedGroup.length) console.log('Group matches WITHOUT channel:', unmatchedGroup.join(', '));
if (channelByPair.size) console.log('Listing entries NOT matched to a fixture:', [...channelByPair.keys()].join(', '));

writeFileSync(FILE, JSON.stringify(matches, null, 2));
console.log('matches.json updated');
