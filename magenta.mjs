import sharp from 'sharp';
import fs from 'fs';
const dir = 'C:/Users/Usuario/AppData/Local/Temp/opencode/mag/candles';
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.webp') || f.startsWith('tmp_')) continue;
  const m = await sharp(`${dir}/${f}`).metadata();
  const buf = await sharp({create:{width:m.width, height:m.height, channels:4, background:{r:255,g:0,b:255,alpha:1}}}).webp().toBuffer();
  fs.writeFileSync(`${dir}/tmp_${f}`, buf);
}
console.log('tmp generados');
