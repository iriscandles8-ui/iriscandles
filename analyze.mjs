import sharp from 'sharp';
const shots = 'C:/Users/Usuario/AppData/Local/Temp/opencode/shots';
const files = {
  tienda: { file: 'tienda-1440-old.jpg', regions: [ {name:'der-header', x:1260, y:0, w:180, h:360} ] },
  eventos: { file: 'eventos-1600-old.jpg', regions: [ {name:'der-header', x:1400, y:0, w:200, h:440} ] },
  nosotros: { file: 'nosotros-1440-old.jpg', regions: [ {name:'bajo-sin-secretos', x:60, y:900, w:700, h:400} ] },
  aroma: { file: 'aroma-1440-old.jpg', regions: [ {name:'der-contenido', x:1240, y:200, w:200, h:700} ] },
  idx: { file: 'idx-1600-old.jpg', regions: [ {name:'hero-izq', x:0, y:560, w:120, h:400}, {name:'jade-der', x:1400, y:1150, w:200, h:500}, {name:'newsletter-der', x:1400, y:2650, w:200, h:400} ] },
};
for (const [page, spec] of Object.entries(files)) {
  let meta; try { meta = await sharp(`${shots}/${spec.file}`).metadata(); } catch(e){ console.log(page, 'NO FILE'); continue; }
  console.log(`\n== ${page} (${spec.file}) ${meta.width}x${meta.height}`);
  for (const r of spec.regions) {
    const w = Math.min(r.w, meta.width - r.x), h = Math.min(r.h, meta.height - r.y);
    if (w<=0||h<=0) { console.log(`  ${r.name}: region fuera de rango`); continue; }
    const { data, info } = await sharp(`${shots}/${spec.file}`).extract({left:r.x, top:r.y, width:w, height:h}).raw().toBuffer({resolveWithObject:true});
    let warm=0, bright=0, total=info.width*info.height;
    for (let i=0;i<data.length;i+=info.channels){
      const R=data[i],G=data[i+1],B=data[i+2];
      const mx=Math.max(R,G,B), mn=Math.min(R,G,B);
      const sat = mx===0?0:(mx-mn)/mx;
      if (sat>0.25 && R>140 && R>=G && G>=B) warm++;
      if (R>240 && G>180 && B>60 && R-B>80) bright++;
    }
    const pct = (100*warm/total).toFixed(2);
    console.log(`  ${r.name}: warm=${warm} (${pct}%) bright=${bright}`);
  }
}


