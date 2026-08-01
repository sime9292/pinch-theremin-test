(async () => {
  try {
    const module = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm");
    const [baseResponse, patchResponse] = await Promise.all([
      fetch("app-clean.js", { cache: "no-store" }),
      fetch("app-v2-patch.js", { cache: "no-store" })
    ]);
    if (!baseResponse.ok || !patchResponse.ok) throw new Error("File applicazione non disponibile");
    const base = (await baseResponse.text()).replace(/^import\s+\{[^;]+\}\s+from\s+[^;]+;\s*/m, "");
    const patch = await patchResponse.text();
    await new Function("HandLandmarker", "FilesetResolver", `return (async()=>{\n${base}\n${patch}\n})()`)(module.HandLandmarker, module.FilesetResolver);
  } catch (error) {
    console.error(error);
    const box = document.getElementById("startError");
    if (box) box.textContent = "Errore nel caricamento dell’app. Ricarica la pagina.";
  }
})();