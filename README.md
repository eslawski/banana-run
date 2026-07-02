# 🍌 Banana Run!

A 3D endless-runner for kids, played by **tilting a PS5 DualSense controller** —
steer by tilting left/right, jump by flicking the controller upward. Collect as
many bananas as you can in 60 seconds. No obstacles, no losing — just bananas.

Built with TypeScript, Three.js, Vite, WebHID, and WebAudio. Every model is
procedural geometry and every sound is synthesized — no asset files.

## Running the game

```bash
npm install
npm run dev        # then open http://localhost:5173 in Chrome
```

For a production build: `npm run build` (output in `dist/`, serve statically).

> **Use Chrome or Edge.** Controller motion data comes through WebHID, which
> Safari and Firefox don't support. Without it the game still works with
> keyboard controls.

## Connecting the PS5 controller (Bluetooth)

1. Put the DualSense in pairing mode: hold the **PS button + Create button**
   (the small button left of the touchpad) until the light bar flashes rapidly.
2. On the computer: **System Settings → Bluetooth → connect "DualSense Wireless
   Controller"**.
3. In the game, click **🎮 Connect PS5 Controller** and pick the controller in
   the browser's device picker (one-time permission; it reconnects
   automatically afterwards).

USB-C cable connection works too, same steps from #3.

### Motion controls

- **Steer:** tilt the whole controller left/right like a steering wheel.
- **Jump:** give the controller a quick upward flick (any sharp shake works —
  it's built for enthusiastic kids). The ✕ button also jumps.
- If steering feels backwards, toggle **Steering: Normal/Flipped** on the home
  screen.
- Menus: d-pad ←/→ picks a character, ✕ or Options starts the run.

### Keyboard fallback

⬅ ➡ (or A/D) to steer, **Space** to jump, **Enter** to start.

## The crew

| Character | Trait |
|---|---|
| Miko the Monkey | All-around awesome |
| Pip the Toucan | Floaty, wing-flapping jumps |
| Raja the Tiger Cub | Runs ~10% faster |
| Bounce the Frog | Jumps the highest |
| Ellie the Elephant | Trunk grabs bananas from farther away |

## The run

Three biomes rotate as you run — **Jungle Temple → Sunny Beach → Crystal
Cave** — with the world transforming ahead of you. Banana patterns include
lines, weaves, double rails, and jump arcs whose peaks you can only reach
mid-air. Speed ramps up over the round. Best score is saved locally.

## Tech notes

- `src/input/dualsense.ts` — WebHID driver. Over Bluetooth the DualSense
  defaults to a simple report without IMU data; reading feature report `0x05`
  switches it to enhanced mode (report `0x31`) which streams gyro + accel at
  ~250Hz.
- `src/input/motion.ts` — low-passes the accelerometer to estimate gravity,
  maps roll angle to steering, and detects jump "jerks" as acceleration spikes
  relative to gravity.
- `src/game/track.ts` — the endless track is a ring of segments rebuilt ahead
  of the player, themed by whatever biome lives at that distance.
- Debug: in the devtools console, `__step(seconds)` advances the game loop
  manually (works even when the tab is hidden).
