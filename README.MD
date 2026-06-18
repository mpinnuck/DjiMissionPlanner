# DJI Mission Planner

DJI Mission Planner is a browser-based waypoint planning tool for DJI drones. The original motivation for this app was straightforward: create a practical mission planner for DJI platforms where DJI has not published a public mission-planning SDK that fits this workflow.

The goal of the tool is to let you design a waypoint mission, export it as a DJI-compatible `.kmz` waypoint mission package, and then load that mission onto a DJI RC using external transfer/injection tools such as `DJI_RC2_KMZ_Sync` or `DJIKMZInjector`.

## What This App Does

The app lets you:

- Create waypoint and POI missions on a map
- Automatically compute waypoint heading and gimbal pitch when a waypoint is assigned to a POI
- Save and reload editable mission data as JSON
- Export the mission as a DJI waypoint `.kmz`
- Preview the mission with a virtual flythrough
- View an FPV-style camera overlay during flythrough
- Apply bulk altitude tools, including constant height above ground
- Configure the drone camera profile used by FPV/FOV logic

This project is focused on mission authoring and export. It does not directly push missions to a DJI controller by itself. The exported `.kmz` is intended to be transferred to the RC using separate tools.

## Why This Exists

For some DJI consumer and prosumer platforms, mission planning support is limited, fragmented, or tied to DJI-controlled tooling. If your workflow depends on creating waypoint missions outside the official DJI planning ecosystem, you need a way to:

- draw and edit missions visually
- preserve those missions in a readable editable format
- generate DJI-compatible waypoint packages
- load those packages into the DJI RC through third-party utilities

That is the gap this app is intended to fill.

## How The App Works

The app is a static web application. It runs fully in the browser and is composed of a few main parts.

### 1. Mission Editing

You place waypoints and POIs directly on the map.

- Waypoints define the flight path
- POIs define targets the camera can look at
- A waypoint can optionally reference a POI
- When a waypoint references a POI, heading and gimbal pitch are computed so the camera points toward that POI

Mission defaults such as altitude, speed, finish action, RC lost action, heading mode, and drone/camera configuration are managed in the Mission Settings panel.

### 2. Mission Storage

The app stores editable missions as JSON.

- On browsers that support the File System Access API, missions can be saved to and loaded from a user-chosen folder
- On browsers without that API, the app falls back to local browser storage

This JSON is the editable working format for the planner. It is not the same as the DJI `.kmz` export package.

### 3. Terrain and Height Above Ground

The app can look up terrain elevation and use it to:

- display height-above-ground (HAG) for every waypoint and POI in the list
- apply a constant HAG value across all waypoints, recalculating each waypoint's altitude to account for the terrain beneath it

This is useful when planning missions over sloping terrain where a constant altitude above takeoff does not correspond to a constant altitude above local ground.

#### How HAG is calculated

DJI missions store waypoint altitude as a value relative to the takeoff point, not relative to sea level or the ground beneath each waypoint. The HAG calculation converts that relative altitude into a meaningful terrain-clearance figure.

The app uses the following reference values:

- **Takeoff ground elevation** — the terrain elevation (metres above sea level, from the elevation service) at the takeoff location. The takeoff location is the position of POI 1 (see below).
- **Takeoff elevation** — the height of the drone above the takeoff ground at the moment it starts the mission, set in the `Takeoff Elev.` field in Mission Settings. For a ground-level launch this is 0. For a rooftop or elevated platform launch this should be set to the platform height in metres.
- **Waypoint ground elevation** — the terrain elevation at each waypoint's map position, also from the elevation service.

The formula for waypoint HAG is:

```
Waypoint ASL = takeoffGround + takeoffElevation + wp.alt
Waypoint HAG = Waypoint ASL - waypointGround
             = wp.alt + takeoffGround + takeoffElevation - waypointGround
```

When you apply a target HAG to a waypoint, the inverse is used to compute the required `wp.alt`:

```
wp.alt = targetHAG + waypointGround - takeoffGround - takeoffElevation
```

This means every waypoint gets an individually adjusted altitude so that, regardless of the terrain beneath it, the drone will fly at the same height above local ground.

### 4. Virtual Flythrough and FPV Preview

The app includes a flythrough simulation that interpolates the mission path and shows:

- playback position
- heading
- field-of-view footprint on the map
- FPV-style camera view

The FPV view uses a drone camera profile. The default profile is DJI Air 3S. A custom camera horizontal field of view can also be entered for preview purposes.

#### Gimbal pitch accuracy

When a waypoint is assigned to a POI, the gimbal pitch is calculated as:

```
gimbalPitch = -atan((wp.alt - poi.alt) / horizDist)
```

where `wp.alt` and `poi.alt` are both altitudes relative to the takeoff point. This is the angle written into the DJI KMZ export and is geometrically correct — the drone camera will point directly at the POI regardless of how much higher or lower the POI terrain is compared to the takeoff location.

This value has been validated against real flight telemetry (DJI Air 3S, DJI RC-2). The FPV virtual preview and the actual in-flight gimbal pitch are in close agreement.

#### POI altitude initialisation

When a new POI is placed on the map, the app automatically fetches the terrain elevation at the POI location and sets the POI altitude so that its **HAG = 0** — meaning the POI sits at ground level at its map position. The formula used is:

```
poi.alt = poiGround - takeoffGround - takeoffElevation
```

This means a POI placed on terrain that is 25 m higher than the takeoff point will have `poi.alt = 25`, and a POI placed in a valley 50 m below the takeoff point will have `poi.alt = -50`. The gimbal pitch calculation uses this value so the camera aims at the actual ground-level position of the POI.

You can manually adjust a POI's altitude (or HAG) in the POI options dialog to aim the camera above or below ground level at that location.

#### FPV simulation and the flat ground plane

The FPV ground plane is always positioned so that the POI ground level sits at the centre of the camera FOV. This is achieved by shifting the satellite tile plane along the Y axis to match `poi.alt` each frame, so the effective camera height above the displayed ground equals `wp.alt − poi.alt` — the same vertical distance the gimbal pitch was computed from.

The relationship between the FPV view and the POI depends on the **POI HAG** (height above ground at the POI location):

| POI HAG | FPV camera centre | Meaning |
|---|---|---|
| `= 0` | POI centred in frame | Camera aimed at POI ground level |
| `> 0` (above ground) | POI moves toward bottom of frame | Camera aimed above the POI |
| `< 0` (below ground) | POI moves toward top of frame | Camera aimed below the POI |

When the POI HAG is 0 the FPV simulation accurately centres the POI in the frame. Adjusting the POI altitude or HAG shifts the aim point up or down in the frame proportionally, providing a realistic preview of where the camera will actually be pointing during the real flight.

The 2D map camera projection (FOV footprint and centre-point circle) also uses the POI terrain elevation as its ground plane, so the centre-point circle lands at the correct location on the map when the camera is aimed at a POI at ground level.

The **gimbal pitch exported to the drone is always correct** regardless of what the FPV shows — the FPV is a planning preview, not a certified flight simulator.

### 5. DJI KMZ Export

When you export, the app generates a DJI waypoint mission package in `.kmz` format containing the expected DJI waypoint mission XML structure.

The export logic includes DJI-specific compatibility rules such as:

- mission configuration metadata
- waypoint placemarks and heights
- waypoint speed handling
- heading mode encoding
- gimbal action generation across segments (see below)
- drone enum information in the exported mission

#### Gimbal action encoding

The KMZ uses two DJI action types to control gimbal pitch during flight:

- **`gimbalRotate` (snap)** — emitted only at waypoint 0. Snaps the gimbal to the first waypoint's pitch at mission start.
- **`gimbalEvenlyRotate`** — emitted for every waypoint except the last. Smoothly rotates the gimbal from the previous waypoint's pitch to the **current** waypoint's pitch over the segment between them.

The key detail: DJI's `betweenAdjacentPoints [i, i]` action fires on the leg *from WP(i−1) to WP(i)* and completes *on arrival at WP(i)*. So the target angle for the action at index `i` must be the pitch of WP(i) itself — not the next waypoint's pitch. This was validated against real flight data (DJI Air 3S, DJI RC-2) and confirmed correct.

The output `.kmz` is designed to be used with tools such as `DJI_RC2_KMZ_Sync` or `DJIKMZInjector` to place the mission where the DJI RC can consume it.

## Project Structure

Key folders:

- `html/` - main HTML page
- `css/` - application styling
- `source/app/` - top-level application orchestration
- `source/map/` - Leaflet map integration
- `source/mission/` - mission model and JSON serialization
- `source/export/` - DJI KMZ export logic
- `source/services/` - location and elevation services
- `source/storage/` - persistent storage backends
- `source/ui/` - UI behavior and dialogs
- `source/virtualflight/` - flythrough and FPV preview logic

## Running The App

This is a static web app. There is no build step.

Open it from a local web server, not from the `file:` protocol.

Example:

```sh
cd /path/to/DjiMissionPlanner
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/html/dji_mission_planner.html
```

Why use a local web server:

- browser geolocation requires a secure context such as `localhost` or HTTPS
- some browser APIs used by save/load flows behave better in a served context

## User Guide

### Basic Workflow

1. Open the app in a browser using `localhost`.
2. Set mission defaults in the Mission Settings panel.
3. Click `Add Waypoint`, then click the map to place waypoints.
4. Click `Add POI`, then click the map to place points of interest.
5. Assign POIs to waypoints if you want automatic camera heading and gimbal pitch.
6. Review the mission in the waypoint list and selected-item panel.
7. Save the editable mission as JSON.
8. Export the DJI `.kmz` mission.
9. Transfer the exported `.kmz` to the DJI RC using `DJI_RC2_KMZ_Sync`, `DJIKMZInjector`, or a similar tool.

### Toolbar Guide

- `Add Waypoint` puts the map into waypoint placement mode
- `Add POI` puts the map into POI placement mode
- `Select` returns to selection/pan mode
- `Unselect All` clears the current selection
- `Clear All` removes all waypoints and POIs
- `Use My Location` centers the map on your current location when browser permissions allow it
- `Save Mission` saves the editable JSON mission to the remembered mission folder. **Double-click or right-click** `Save Mission` to pick a new file location (Save As). **Long-press** (hold ≥ 0.5 s) `Save Mission` to open a folder picker and change which folder missions are saved into. On iOS/iPadOS, **tap** `Save 💾` to save silently to device storage (localStorage). **Long-press** `Save 💾` on iOS/iPadOS to push the file to iCloud — tap **Save to Files**, navigate to your iCloud folder, tap the existing file, then tap **Replace**
- `Load Mission` opens a file picker to load a previously saved JSON mission. The folder from the loaded file is remembered and used as the default location for subsequent saves and loads
- `Export KMZ` generates the DJI waypoint package and saves it to the remembered KMZ export folder. **Double-click or right-click** `Export KMZ` to open a folder picker and choose a new export location (Export As). **Long-press** (hold ≥ 0.5 s) `Export KMZ` to change the remembered KMZ export folder without performing an export. On iOS/iPadOS, **tap** `Export 📤` to export KMZ via the system share sheet — tap **Save to Files**, navigate to your iCloud folder, tap the existing file, then tap **Replace** to overwrite it
- `Play` resumes or starts the virtual flythrough from the **current aircraft position** and the button label changes to `Pause`. Click again to pause. **Double-click** to restart playback from the **beginning of the mission**
- `Stop` stops the flythrough and resets the aircraft to the beginning of the mission
- `FOV` toggles the camera field-of-view footprint on the map
- `FPV` shows or hides the FPV preview panel

### Mission Settings

Mission Settings control default values and export behavior.

- `Mission Name` is used for save/export naming
- `Default Alt.` is the altitude used for new waypoints
- `Apply all` next to altitude applies that altitude to every waypoint
- `Default Speed` is the default waypoint speed
- `Drone` selects the camera/drone profile used for preview/export metadata
- `Cam HFOV` sets the custom camera horizontal field of view when `Custom Camera` is selected
- `Takeoff Elev.` is the height of the drone above the takeoff ground at the start of the mission. Set this if the drone launches from an elevated surface such as a rooftop or raised platform. Defaults to 0 for ground-level takeoff. This value is used to correctly compute height-above-ground across the mission
- `Const. HAG` sets a target constant height above ground
- `Apply all` next to HAG recalculates all waypoint altitudes to maintain that ground clearance
- `Finish Action` controls the mission completion behavior in the export
- `RC Lost` controls the exported RC-loss behavior
- `Heading Mode` defines the default heading mode used when a waypoint is not POI-driven

### Working With Waypoints

When a waypoint is selected, you can edit:

- altitude
- speed
- assigned POI

When a POI is assigned to a waypoint, the app recomputes:

- heading toward the POI
- gimbal pitch required to point at that POI

You can also:

- drag waypoint markers to move them
- insert waypoints into the route from the map path tools
- **double-click / double-tap** a waypoint marker to open the waypoint options dialog
- multi-select waypoints by clicking them
- apply bulk updates to multiple selected waypoints
- copy multiple selected waypoints to the clipboard with `Cmd+C` or `Ctrl+C`

### Working With POIs

POIs are used as camera look targets.

You can:

- create POIs on the map
- rename them
- set their altitude (relative to the takeoff point)
- drag them to a new location
- **single-click / single-tap** a POI marker to select it (it turns light green)
- **double-click / double-tap** a POI marker to open the POI options dialog

Changing a POI can change the heading and gimbal pitch of waypoints that reference it.

#### POI 1 — Takeoff Reference Convention

By convention, **POI 1** should be placed at the takeoff location. The app uses POI 1's latitude and longitude as the reference point for all terrain elevation lookups and HAG calculations across the entire mission.

The app identifies POI 1 in the following order of precedence:
1. The POI whose internal ID is `poi_1` (the first POI created in the mission).
2. Any POI whose display name resolves to `1`.
3. If neither exists, the first POI in the list is used as a fallback.

When a new POI is created, its altitude is automatically initialised to its height above ground relative to the current takeoff reference, so POIs start at a sensible terrain-relative altitude rather than zero.

POI 1 is otherwise a completely normal POI. It can be renamed, moved, and assigned to waypoints like any other POI. Moving POI 1 changes the takeoff reference location and triggers a recalculation of HAG values for all waypoints.

The actual height of the drone above the ground at the takeoff location is set separately using the **Takeoff Elev.** field in Mission Settings. This represents how far above the ground surface the drone is when it begins the mission — for example, 1.5 m for a ground-level hand launch, or the height of a rooftop for an elevated platform launch. For a standard ground-level takeoff, leave this at 0.

### Flythrough and FPV

The virtual flythrough is useful for checking the mission visually before export.

- `Play` animates the mission
- `Pause` freezes playback
- `Stop` returns to the start
- speed control adjusts playback rate
- the seek slider jumps to a point in the mission timeline
- `FOV` shows the projected camera footprint on the map
- `FPV` opens a camera-style preview with telemetry such as altitude, heading, speed, and gimbal pitch

This is a planning preview, not a physics-accurate flight simulator.

### Save and Load

The app supports two storage modes depending on browser capabilities.

- Preferred: File System Access API using a chosen local folder
- Fallback: browser local storage

On iOS/iPadOS Safari the app always uses device storage (localStorage) — the File System Access API is intentionally bypassed to avoid triggering iOS folder pickers on every save.

**Desktop (Chrome/Edge with File System Access API)**

- **Click** `Save Mission` — saves to the remembered mission folder immediately.
- **Long-press** `Save Mission` (hold ≥ 0.5 s) — opens a folder picker to change the mission save folder.
- **Right-click or double-click** `Save Mission` — Save As (pick a new file name/location).
- **Click** `Export KMZ` — exports to the remembered KMZ folder immediately.
- **Long-press** `Export KMZ` (hold ≥ 0.5 s) — opens a folder picker to change the KMZ export folder.
- **Right-click or double-click** `Export KMZ` — Export As (pick a new folder/location).

**iOS/iPadOS Safari**

- **Tap** `Save 💾` — saves silently to device storage (overwrites, no dialog).
- **Long-press** `Save 💾` — pushes the file to iCloud so it is accessible on other devices (desktop, other iPads). Tap **Save to Files**, navigate to your iCloud folder, tap the existing file, then tap **Replace**.
- **Long-press** `Export 📤` — same share-sheet flow for KMZ files, useful for opening them on a device running DJI Fly.

Saved missions use JSON so they can be reloaded and edited later.

### Cloud-Based Workflow (iCloud, OneDrive, Google Drive)

Keeping your mission JSON files in a cloud-synced folder is the recommended way to use the app across devices. It gives you a single mission library that is accessible everywhere — plan at your desk, refine on-site in the field, and export directly from your mobile device before flying.

**Typical round-trip workflow:**

1. **Plan on desktop** — create or refine the mission on a desktop browser with full File System Access support. Save to a cloud folder such as `iCloud Drive/Drone/Missions/Planner`.
2. **Take it to the field** — the cloud folder syncs automatically to your iPad or iPhone. Open the app on iPad Safari, tap `Load Mission → Open from Files...`, and navigate to the cloud folder to open the mission.
3. **Adjust on-site** — move waypoints, tweak altitudes or speeds, set the takeoff elevation for the actual launch location. The full editor is available on mobile.
4. **Export from the field** — tap `Export 📤` (or long-press to share via the system share sheet) to generate the `.kmz` directly on the device.
5. **Save edits back to cloud** — long-press `Save 💾` and tap **Save to Files** to write the updated JSON back to the cloud folder so your desktop copy stays in sync.

Recommended folder structure:

```
iCloud Drive/Drone/Missions/Planner/
  SiteName1.json
  SiteName2.json
  ...
```

Notes:

- The app can only display paths that browser APIs expose. Some dialogs show relative paths rather than full OS paths.
- Load/save mission context and KMZ export folder context are tracked independently.
- If cloud providers are available through the iOS Files app, they are usable via `Open from Files...`.
- Changes made in the field are only synced back to desktop if you explicitly save back to the cloud file (step 5 above). The in-browser localStorage copy on the device is separate from the cloud file.

### Exporting DJI KMZ Missions

To export:

1. Build or load your mission.
2. Click `Export KMZ`.
3. Choose an export folder when prompted.
4. The app writes the `.kmz` package for transfer to the DJI controller.

Notes:

- The export folder can be changed by right-clicking `Export KMZ`, double-clicking it, or long-pressing it on desktop (hold ≥ 0.5 s)
- On iOS/iPadOS, long-press `Export 📤` to trigger the share sheet
- The exported `.kmz` is the deliverable for DJI mission injection/sync tools

## Limitations And Notes

- This app is not an official DJI product
- It depends on browser support for modern web APIs for the best save/load experience
- Geolocation requires browser permission and a secure context such as `localhost` or HTTPS
- Terrain/elevation results depend on the external elevation service and should be treated as planning aids, not certified flight data
- Drone support in export metadata is currently centered on DJI Air 3S, with a custom camera option for preview tuning

## Packaging The Source

To create a zip archive of the source tree:

```sh
make zip-source
```

This generates `sources.zip` in the repository root.

## Intended Workflow Summary

1. Plan the mission in the browser
2. Save the editable JSON version
3. Export a DJI waypoint `.kmz`
4. Copy/inject that `.kmz` onto the DJI RC using tools such as `DJI_RC2_KMZ_Sync` or `DJIKMZInjector`
5. Fly the mission using the DJI controller environment that recognizes the injected package

## Disclaimer

Use this software carefully and validate every mission before flight. The pilot remains responsible for airspace compliance, aircraft limitations, obstacle clearance, terrain clearance, and safe mission execution.