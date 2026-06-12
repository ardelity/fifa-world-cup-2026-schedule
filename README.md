# FIFA World Cup 2026 — Schedule

A self-contained, offline-capable schedule page for the 2026 World Cup: all 104 matches with
kick-off times (UTC / Europe/Stockholm), Swedish broadcaster (SVT/TV4), venues, group standings,
and filters for teams, venues and host countries.

Open `index.html` in a browser — no server needed.

## Views

- **List** — all matches chronologically with day headers
- **Calendar** — month grids with matches per day (red border = TV4, green = SVT)
- **Groups** — standings + fixtures per group (computed from played results)
- **Venues** — matches per stadium

The left sidebar filters by host country, venue and team; selected teams are color-highlighted
in every view.

## Refreshing data

Scores and knockout matchups fill in as the tournament progresses. To refresh:

```powershell
# 1. Re-download the fixture feed (sorted by kick-off)
$r = Invoke-RestMethod "https://fixturedownload.com/feed/json/fifa-world-cup-2026"
$m = $r | Sort-Object { [datetime]::Parse($_.DateUtc.Replace(' ','T')) } | ForEach-Object {
  [ordered]@{ matchNumber = $_.MatchNumber
    dateUtc = ([datetime]::Parse($_.DateUtc.Replace(' ','T'), $null, 'AdjustToUniversal')).ToString('yyyy-MM-ddTHH:mm:ssZ')
    homeTeam = $_.HomeTeam; awayTeam = $_.AwayTeam; group = $_.Group; location = $_.Location
    homeScore = $_.HomeTeamScore; awayScore = $_.AwayTeamScore }
}
$m | ConvertTo-Json -Depth 3 | Set-Content matches.json -Encoding utf8NoBOM

# 2. Re-apply enrichments and rebuild the page
node add_broadcasters.mjs
node add_locations.mjs
./gen_html.ps1
```

## Data sources

- Fixtures and results: [fixturedownload.com](https://fixturedownload.com/results/fifa-world-cup-2026)
- Swedish broadcasters (group stage): [svenskfotboll.se](https://www.svenskfotboll.se/nyheter/landslag/2026/05/sa-sands-vm/) —
  knockout channels are unannounced; add them to `add_broadcasters.mjs` when published
- Channel logos: Wikimedia Commons (SVT logos recolored white for the dark theme)
