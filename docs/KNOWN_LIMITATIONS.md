# Known Limitations & Clean-Room Engineering Tradeoffs

1. **Procedural Character Geometry vs Reference `.glb` Rigs:**
   - The live reference at `https://fightkaro.com/` loads Draco-compressed `.glb` models, photo-based `.webp` portraits, and pre-recorded `.mp3` speech/music files (`ev_07e8e9f9...`, `ev_695f9ce8...`).
   - To respect reverse-engineering integrity and avoid redistributing third-party copyrighted models, face photography, or audio files, this reconstruction uses original parametric stylized 3D articulated rigs (`src/rendering/FighterRig.ts`), offscreen procedural portraits (`src/rendering/PortraitFactory.ts`), and Web Audio procedural synthesis (`src/audio/AudioEngine.ts`).

2. **Browser-Agnostic Room Transport (HTTP + WebSocket vs WebRTC DataChannels):**
   - The reference client (`rooms-CRfnBsqC.js`) pairs HTTP signaling with `RTCPeerConnection` ICE/STUN/TURN DataChannels.
   - To guarantee reliable local and LAN two-browser play without external STUN/TURN server dependencies, our independent server (`server/roomServer.ts`) relays compact 6-byte binary input frames and JSON lobby/snapshot messages directly over WebSockets (`/ws`) alongside REST room endpoints (`/api/room`).

3. **Software WebGL Rendering Fallback & Chapter 2 Trailer:**
   - On CPU software GL renderers (such as headless SwiftShader), `ThreeScene` automatically skips full-screen `UnrealBloomPass` FBO blurs and double-pass shadow maps (relying on ground contact shadow discs) so frame rates stay playable; hardware WebGL GPUs retain full bloom and PCF shadow mapping.
   - The promotional Chapter 2 video trailer & creator social/UPI donation overlays present on the reference site are excluded in favor of core playable gameplay, Fighter Select, CPU tiers, Boss mode, and Friend Multiplayer.
