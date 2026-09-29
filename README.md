# CRITCHELL GAME COLLECTION

Personal physical + digital game catalogue, designed for Railway.

## Railway setup

Mount a Railway Volume at:

```text
/data
```

This keeps `collection.json` persistent across redeploys.

### Required admin variables

```text
ADMIN_USERNAME=your-username
ADMIN_PASSWORD=your-private-password
```

Optional but recommended:

```text
ADMIN_SESSION_SECRET=a-long-random-secret
```

Only a logged-in admin can add, edit, delete, import/export, or use automatic game lookup.

## Automatic game lookup

Version 1.4 supports **three lookup sources**. You can configure one, two, or all three. The Add Game screen lets you search all configured sources together or choose one source specifically.

### 1. IGDB

Recommended as the main all-round database for PlayStation, Xbox, Nintendo, PC and many older systems.

Create Twitch/IGDB application credentials and add:

```text
IGDB_CLIENT_ID=your-client-id
IGDB_CLIENT_SECRET=your-client-secret
```

The server automatically requests and refreshes the OAuth access token, so you do **not** need to manually create an IGDB token.

### 2. TheGamesDB

Useful for console/retro metadata and artwork.

```text
THEGAMESDB_API_KEY=your-api-key
```

### 3. Steam

Uses Valve's Steam Web API catalogue for Steam game matching.

```text
STEAM_WEB_API_KEY=your-steam-web-api-key
```

Steam matches automatically suggest:

- Platform: Windows PC
- Format: Digital
- Store: Steam

IGDB/TheGamesDB can provide richer general metadata, while Steam is useful for identifying the exact Steam catalogue entry.

## Search flow

1. Log in as admin.
2. Open **Add Game**.
3. Choose **Search all available sources**, IGDB, TheGamesDB, or Steam.
4. Type the game title.
5. The site displays a selection of likely matches with **“Do you mean this one?”**.
6. Select a match and the available metadata is copied into the Add Game form.
7. Choose/edit the exact platform, physical/digital format, storefront and edition you own.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Without lookup API credentials, manual game entry still works normally.


## Import Games (Merge)

Admin now has two separate JSON import actions:

- **Import Games (Merge)** adds games/copies to the existing collection without deleting anything. Re-importing the same list safely skips duplicate copies.
- **Restore Full Backup** is the original disaster-recovery function and replaces the complete collection.

For Steam batch files generated for this site, use **Import Games (Merge)**.
