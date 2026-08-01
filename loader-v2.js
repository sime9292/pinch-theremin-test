(async () => {
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm");
    const [baseResponse, patchResponse, midpointResponse, glideResponse, sampledResponse] = await Promise.all([
      fetch("app-clean.js", { cache: "no-store" }),
      fetch("app-v2-patch.js", { cache: "no-store" }),
      fetch("app-v3-midpoint.js", { cache: "no-store" }),
      fetch("app-v4-quantized-glide.js", { cache: "no-store" }),
      fetch("app-v7-sampled-voice.js", { cache: "no-store" })
    ]);
    if (!baseResponse.ok || !patchResponse.ok || !midpointResponse.ok || !glideResponse.ok || !sampledResponse.ok) {
      throw new Error("File applicazione non disponibile");
    }
    const base = (await baseResponse.text()).replace(/^import\s+\{[^;]+\}\s+from\s+[^;]+;\s*/m, "");
    const patch = await patchResponse.text();
    const midpoint = await midpointResponse.text();
    const glide = await glideResponse.text();
    const sampled = await sampledResponse.text();
    await new Function(
      "HandLandmarker",
      "FilesetResolver",
      `return (async()=>{\n${base}\n${patch}\n${midpoint}\n${glide}\n${sampled}\n})()`
    )(module.HandLandmarker, module.FilesetResolver);
  } catch (error) {
    console.error(error);
    const box = document.getElementById("startError");
    if (box) box.textContent = "Errore nel caricamento dell’app. Ricarica la pagina.";
  }
})();