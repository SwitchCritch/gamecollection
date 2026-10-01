## Version 1.8.7

Digital now opens a dedicated Stores & Launchers folder page. The footer shows v1.8.7 so you can verify the deployed frontend.

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

## v1.7 - Bulk metadata enrichment
Admin now includes **Auto-fill Missing Metadata**. It works through games with missing cover/details using configured lookup providers (TheGamesDB first, then IGDB, then Steam) and preserves metadata already entered. This is useful after a large Merge Import.

## v1.8 persistence safety fix

On Railway the app now reads the platform-provided `RAILWAY_VOLUME_MOUNT_PATH` automatically, instead of assuming the volume is always mounted at `/data`. This prevents an attached volume at `/app/data` (or another mount path) from being ignored.

The app also checks common legacy paths (`/data/collection.json`, `/app/data/collection.json`, and the old project `data/collection.json`) and copies the best existing collection into the active volume if the new active collection file does not yet exist.

When running on Railway without an attached volume, all collection-changing endpoints are safety-locked. The public site can still load, but Add/Edit/Delete/Import/Auto-enrich cannot write to temporary storage. Attach a Railway Volume to the service, redeploy, then open Admin to confirm the exact persistent mount path and saved game count.

## v1.8.2
- IGDB is now the default lookup source when configured.
- Bulk metadata enrichment tries IGDB first, then TheGamesDB, then Steam.
- A confident IGDB match replaces older cover artwork with IGDB portrait artwork while preserving other existing metadata.
