# CRITCHELL GAME COLLECTION

A Railway-ready personal game catalogue for physical and digital games.

## Features
- One game can have multiple owned copies/platforms.
- Physical and digital ownership.
- Steam, Epic, GOG, Rockstar, EA, Ubisoft, Xbox/Microsoft, Battle.net and other stores.
- Extensive console/computer platform list.
- Search and filters.
- Platform, Physical, Digital, Backlog and Favourite views.
- Status, personal rating, developer, publisher, genres, notes and cover art.
- Physical copy fields for box, manual, disc/cartridge and steelbook.
- JSON backup export/import.
- Railway persistent storage support at `/data`.
- Responsive phone/desktop interface.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy to Railway
1. Upload/push this project to GitHub.
2. Create a Railway project from the GitHub repository.
3. Railway will install dependencies and run `npm start`.
4. Add a Railway Volume and mount it at `/data`.
5. Redeploy. The Admin panel should then say persistent storage is detected.

## Data
The collection is stored as `collection.json`. On Railway with a `/data` Volume it lives at:

`/data/collection.json`

Without a volume it falls back to the local `data/` folder.

## Backups
Open ADMIN and click **Export Backup**. This downloads the complete collection as JSON. Use **Import Backup** to restore it.


## Automatic game lookup (RAWG)

The Add Game screen can search RAWG and show a selection of possible matches before filling the form. This works for PC/Steam games and console games including PlayStation, Xbox, Nintendo and many older systems.

1. Create a free personal/hobby API key at https://rawg.io/apidocs
2. In Railway, open your project/service and go to **Variables**.
3. Add a variable named `RAWG_API_KEY`.
4. Paste your RAWG API key as the value.
5. Redeploy/restart the service if Railway does not do so automatically.

Without `RAWG_API_KEY`, the catalogue still works normally; only automatic lookup is disabled.

### How lookup works

Open **Admin → Add Game**, type a title into **Find the game automatically**, and click **Search games**. The site shows up to 12 likely matches with cover art, year and platforms. Click **Do you mean this one?** on the correct result. The title, release date, developer, publisher, genres, cover and description are then filled automatically.

RAWG attribution is included in the site footer as required for its personal/hobby API usage.
