import {readFile, mkdir, writeFile, cp} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('content/scenarios.json',root),'utf8'));
const template=await readFile(new URL('src/widget.html',root),'utf8');
const notes=JSON.parse(await readFile(new URL('content/slides/notes.json',root),'utf8'));
const media={};
for(const {no} of data.deck){
 const bytes=await readFile(new URL('content/slides/'+no+'.webp',root));
 media[no]={image:'data:image/webp;base64,'+bytes.toString('base64'),script:notes[no]};
}
const html=template.replace('/*SLIDE_MEDIA*/{}',()=>JSON.stringify(media).replaceAll('<','\\u003c'));
const server=await readFile(new URL('src/server.js',root),'utf8');
await mkdir(new URL('dist/server/',root),{recursive:true});
await mkdir(new URL('dist/.openai/',root),{recursive:true});
await writeFile(new URL('dist/server/index.js',root),'const DATA='+JSON.stringify(data)+';\nconst WIDGET='+JSON.stringify(html)+';\n'+server);
await cp(new URL('.openai/hosting.json',root),new URL('dist/.openai/hosting.json',root));
console.log('Built Worker with 29 scenarios and MCP Apps UI');
