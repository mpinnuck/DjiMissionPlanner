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

#### FPV simulation and the flat ground plane

The FPV 3D scene renders satellite imagery on a flat plane at **y = 0**, which represents the takeoff ground elevation. The drone camera is positioned at `wp.alt` metres above that plane. The satellite tiles are a photograph of the actual terrain but they are pinned to this flat reference plane, not draped over real terrain.

As a result, the relationship between the FPV view and the POI depends on terrain:

| POI terrain vs takeoff | `poi.alt` | FPV camera centre | 2D circle |
|---|---|---|---|
| Same level as takeoff | `0` | POI centred in frame | Lands on POI |
| Higher than takeoff | `> 0` | POI appears below centre | Overshoots POI |
| Lower than takeoff | `< 0` | POI appears above centre | Undershoots POI |

The **2D camera projection circle** on the map shows where the centre of the camera FOV intersects the y=0 ground plane. When the POI terrain differs from takeoff level the circle will not land exactly on the POI marker — this is expected and is a direct visual indicator of terrain difference, not a calculation error.

The **gimbal pitch exported to the drone is always correct** for the real terrain. The FPV simulation is a flat-world approximation; the offset of the POI within the FPV frame reflects the elevation difference between the POI ground and the takeoff point.

### 5. DJI KMZ Export

When you export, the app generates a DJI waypoint mission package in `.kmz` format containing the expected DJI waypoint mission XML structure.

The export logic includes DJI-specific compatibility rules such as:

- mission configuration metadata
- waypoint placemarks and heights
- waypoint speed handling
- heading mode encoding
- gimbal action generation across segments
- drone enum information in the exported mission

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
- `Save Mission` saves the editable JSON mission
- `Load Mission` loads a previously saved JSON mission
- `Export KMZ` generates the DJI waypoint package
- `Play`, `Pause`, `Stop` control the virtual flythrough
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
- multi-select waypoints
- apply bulk updates to multiple selected waypoints
- copy multiple selected waypoints to the clipboard with `Cmd+C` or `Ctrl+C`

### Working With POIs

POIs are used as camera look targets.

You can:

- create POIs on the map
- rename them
- set their altitude (relative to the takeoff point)
- drag them to a new location

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

On iOS/iPadOS Safari, `showOpenFilePicker` is not available. The mission load dialog includes an `Open from Files...` action that uses the native Files picker (`<input type="file">`) so you can load mission JSON from iCloud Drive or other Files providers.

Saved missions use JSON so they can be reloaded and edited later.

### Cloud-Based Workflow (iCloud, OneDrive, Google Drive)

If you want one shared mission library across desktop and iPad, keep your mission JSON files in a cloud-synced folder and use that as your primary working location.

Recommended pattern:

1. Create a cloud folder for missions, for example `iCloud Drive/Drone/Missions/Planner/Home`.
2. On desktop browsers with File System Access support, choose that folder as your mission root.
3. Save mission JSON files into that folder from desktop.
4. On iPad Safari, use `Load Mission` and then `Open from Files...` to open JSON files from the same cloud folder.
5. Export KMZ as needed for your RC workflow.

Notes:

- The app can only display paths that browser APIs expose. Some dialogs show relative paths rather than full OS paths.
- Load/save mission context and KMZ export folder context are tracked independently.
- If cloud providers are available through the iOS Files app, they are usable via `Open from Files...`.

### Exporting DJI KMZ Missions

To export:

1. Build or load your mission.
2. Click `Export KMZ`.
3. Choose an export folder when prompted.
4. The app writes the `.kmz` package for transfer to the DJI controller.

Notes:

- The export folder can be changed by right-clicking the `Export KMZ` button
- On touch devices, a long press is used for the same action
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