Tally downloads its assistant model (NVIDIA Nemotron 3 Nano 4B, about 2.8 GB) by itself the first
time the app opens, in the background, so the installer stays small. Nothing needs to go in this folder.

For an offline build you can still put NVIDIA-Nemotron3-Nano-4B-Q4_K_M.gguf here before
`npm run app:build` to bundle it. That makes the installer about 3 GB, which is too close to
Apple's 4 GB notarization limit, so don't do it for public releases.
