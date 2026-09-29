# CRITCHELL GAME COLLECTION v1.3

A Railway-ready personal game catalogue for physical and digital games.


## What changed in v1.3
- Replaced RAWG lookup with the official **MobyGames API**.
- Search still uses the same **“Do you mean this one?”** selection flow.
- MobyGames results can fill title, release date, cover, genres, platforms, description, developer and publisher when those fields are supplied by the API.
- Railway now uses `MOBYGAMES_API_KEY` instead of `RAWG_API_KEY`.
- Added MobyGames-required attribution in the interface/footer.
- Friendly messages are shown for invalid keys and API rate limits.

## What changed in v1.2
- **Real admin login**: visitors can browse the collection, but only the logged-in admin can add, edit, delete, import/export or use the game lookup tools.
- **Server-side protection**: admin-only API routes return `401 Admin login required` even if somebody tries to call them directly.
- **Much clearer game lookup**: Add Game opens with **STEP 1 · SEARCH THE GAME DATABASE**. Search results explicitly ask **“Do you mean this one?”** and provide **SELECT THIS GAME**.
- The homepage **+ Add Game** button only appears while the admin is logged in.
- The Admin screen includes a **Log out** button.

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
- Automatic metadata lookup using the official MobyGames API.

## Railway setup

Push/upload this project to GitHub and deploy the repository on Railway. Railway will install dependencies and run `npm start`.

### 1. Persistent collection storage
Create a Railway Volume and mount it at:

```text
/data
```

This keeps `collection.json` safe across redeploys.

### 2. Admin login — REQUIRED
In **Railway → your service → Variables**, add:

```text
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=choose-a-strong-password
```

For example, `ADMIN_USERNAME=Malcolm` is fine, but choose your own private password.

Do **not** put the real password into `server.js`, GitHub, or this README. Railway Variables keep it outside the code repository.

Optional extra security variable:

```text
ADMIN_SESSION_SECRET=a-long-random-secret
```

If you do not add `ADMIN_SESSION_SECRET`, the app derives a signing secret from the admin password. Changing the admin password will automatically invalidate old login sessions.

After adding/changing these variables, redeploy/restart the Railway service.

When configured, the site header says **ADMIN LOGIN**. After a successful login it changes to **ADMIN** and the **+ Add Game** button becomes visible.

### 3. Automatic game search — MobyGames
Get MobyGames API access from:

https://www.mobygames.com/api/

Then add this Railway variable:

```text
MOBYGAMES_API_KEY=your-mobygames-key
```

Redeploy/restart the service.

If this variable is missing, Add Game clearly reports that automatic lookup is not configured. Manual game entry still works.

## How automatic lookup works
1. Log in through **ADMIN LOGIN**.
2. Open **Admin → + Add Game**.
3. The first section is **STEP 1 · SEARCH THE GAME DATABASE**.
4. Type a title, for example `Silent Hill 2`.
5. Press **Search games**.
6. The site shows up to 12 matches with cover art, year, genres and platforms.
7. Each result asks **Do you mean this one?**.
8. Press **SELECT THIS GAME** on the correct match.
9. Title, release date, developer, publisher, genres, cover and description are filled automatically.
10. Choose the exact platform, Physical/Digital format and store for the copy you own, then save.

## Public vs admin permissions
Public visitors can:
- Browse the collection.
- Search/filter the collection.
- Open game details.

Only a logged-in admin can:
- Add games.
- Search MobyGames while adding/editing.
- Edit games.
- Delete games.
- Import a backup.
- Export a backup.
- View admin/storage diagnostics.

## Run locally

```bash
npm install
ADMIN_USERNAME=Malcolm ADMIN_PASSWORD='your-password' MOBYGAMES_API_KEY='your-key' npm start
```

Open http://localhost:3000

## Data and backups
The catalogue itself is stored as `/data/collection.json` when the Railway volume exists, otherwise it falls back to the local `data/` folder.

Log in, open **ADMIN**, then use **Export Backup** to download the complete collection as JSON. Use **Import Backup** to restore it.

Game metadata/artwork lookup uses the official MobyGames API; the required “Data by MobyGames.com” attribution is included in the site footer.


### Admin login troubleshooting
If the site says **Admin setup required**, the server has not detected `ADMIN_USERNAME` and `ADMIN_PASSWORD`. Add both under **Railway → your service → Variables**, redeploy, then click **Check again** on the login screen. The browser form cannot create the admin account.
