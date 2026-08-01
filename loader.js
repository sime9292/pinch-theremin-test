(async()=>{
  try{
    const files=["app-part-1.js","app-part-2.js","app-part-3.js","app-part-4.js","app-part-5.js","app-part-6.js","app-part-7.js","app-part-8.js","app-part-9.js","app-part-10.js"];
    const parts=await Promise.all(files.map(async file=>{
      const response=await fetch(file,{cache:"no-store"});
      if(!response.ok)throw new Error(`${file}: ${response.status}`);
      return response.text();
    }));
    await new Function(`return (async()=>{\n${parts.join("\n")}\n})()` )();
  }catch(error){
    console.error(error);
    const box=document.getElementById("startError");
    if(box)box.textContent="Errore nel caricamento dell’app. Ricarica la pagina.";
  }
})();
