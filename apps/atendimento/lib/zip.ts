/** Minimal ZIP/STORE writer (no persistent files, no extra dependency). */
import { Buffer } from "node:buffer";
export type ZipEntry = {path:string; data:Buffer};
const crcTable = Array.from({length:256},(_,n)=>{
  let c=n;
  for(let i=0;i<8;i++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(data:Buffer){
  let c=0xffffffff;
  for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
export function packZip(entries:ZipEntry[]):Buffer {
  if(entries.length<1 || entries.length>100)throw new Error("Quantidade de arquivos fora do limite.");
  const bodies:Buffer[]=[],directory:Buffer[]=[];
  let offset=0;
  const seen=new Set<string>();
  for(const entry of entries){
    if(!/^[a-zA-Z0-9_.\/-]+$/.test(entry.path) || entry.path.includes("..") || entry.path.startsWith("/") || seen.has(entry.path))
      throw new Error("Caminho de arquivo inválido no pacote.");
    seen.add(entry.path);
    const name=Buffer.from(entry.path,"utf8"),body=entry.data,crc=crc32(body);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x0800,6); // UTF-8
    local.writeUInt16LE(0,8); // STORE
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(body.length,18);
    local.writeUInt32LE(body.length,22);
    local.writeUInt16LE(name.length,26);
    bodies.push(local,name,body);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);
    central.writeUInt16LE(0,10);
    central.writeUInt32LE(crc,16);
    central.writeUInt32LE(body.length,20);
    central.writeUInt32LE(body.length,24);
    central.writeUInt16LE(name.length,28);
    central.writeUInt32LE(offset,42);
    directory.push(central,name);
    offset+=local.length+name.length+body.length;
  }
  const centralLength=directory.reduce((n,b)=>n+b.length,0);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(entries.length,8);
  end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralLength,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...bodies,...directory,end]);
}
