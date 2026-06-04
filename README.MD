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

- display height-above-ground information per waypoint
- apply a constant HAG value across all waypoints

This is useful when planning missions over sloping terrain where a constant altitude above takeoff does not correspond to a constant altitude above local ground.

### 4. Virtual Flythrough and FPV Preview

The app includes a flythrough simulation that interpolates the mission path and shows:

- playback position
- heading
- field-of-view footprint on the map
- FPV-style camera view

The FPV view uses a drone camera profile. The default profile is DJI Air 3S. A custom camera horizontal field of view can also be entered for preview purposes.

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
- set their altitude
- drag them to a new location

Changing a POI can change the heading and gimbal pitch of waypoints that reference it.

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

Saved missions use JSON so they can be reloaded and edited later.

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