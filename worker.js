const seedStudents = [
  ['Ada Yılmaz','12-A','Birlikte daha güzel.','https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=700'],
  ['Arda Demir','12-A','Anı biriktir.','https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=700'],
  ['Ece Kaya','12-A','Gülümsemeyi unutma.','https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=700'],
  ['Mert Şahin','12-A','İyi ki aynı sınıftaydık.','https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=700'],
  ['Elif Aydın','12-B','Her şey güzel olacak.','https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=700'],
  ['Can Eren','12-B','Yolun açık olsun.','https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=700'],
  ['Zeynep Arslan','12-B','Bu yılları unutma.','https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=700'],
  ['Bora Çelik','12-B','Hep gül.','https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=700'],
  ['Deniz Koç','12-C','Güzel anılar bizimle.','https://images.unsplash.com/photo-1504593811423-6dd665756598?w=700'],
  ['Nazlı Öz','12-C','İyi ki varsın.','https://images.unsplash.com/photo-1517841905240-472988babdf9?w=700'],
  ['Emir Aksoy','12-C','Yeni başlangıçlara.','https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=700'],
  ['Selin Tunç','12-C','Seni hep hatırlayacağız.','https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=700']
];
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8'}});
async function body(req){ try{return await req.json()}catch{return {}} }
function auth(req, env){ return req.headers.get('x-admin-pin') === env.ADMIN_PIN }
async function ensureSeed(env){
  const r=await env.ANDAC_DB.prepare('SELECT COUNT(*) c FROM students').first();
  if(Number(r.c)===0){
    const stmts=seedStudents.map(s=>env.ANDAC_DB.prepare('INSERT INTO students(name,class_name,motto,photo,target) VALUES(?,?,?,?,5)').bind(...s));
    await env.ANDAC_DB.batch(stmts);
  }
}
async function students(env){
  return (await env.ANDAC_DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM notes n WHERE n.student_id=s.id AND n.status='approved') approved_count, (SELECT COUNT(*) FROM notes n WHERE n.student_id=s.id) total_notes FROM students s ORDER BY s.id`).all()).results;
}
async function notes(env, url){
  let sql=`SELECT n.*,s.name student_name,s.class_name FROM notes n JOIN students s ON s.id=n.student_id WHERE 1=1`, args=[];
  const status=url.searchParams.get('status'); const student=url.searchParams.get('student'); const search=url.searchParams.get('search');
  if(status&&status!=='all'){sql+=' AND n.status=?';args.push(status)}
  if(student){sql+=' AND n.student_id=?';args.push(Number(student))}
  if(search){sql+=` AND (lower(s.name) LIKE lower(?) OR lower(n.writer_name) LIKE lower(?) OR lower(n.content) LIKE lower(?))`;const q=`%${search}%`;args.push(q,q,q)}
  sql+=' ORDER BY n.id DESC'; return (await env.ANDAC_DB.prepare(sql).bind(...args).all()).results;
}
function csv(rows){const h=['Tarih','Ogrenci','Sinif','Yazar','Iliski','Yazi','Durum'];const vals=rows.map(n=>[n.created_at,n.student_name,n.class_name,n.writer_name,n.relationship,n.content,n.status]);const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';return '\ufeff'+[h,...vals].map(r=>r.map(q).join(',')).join('\r\n')}
async function route(req, env){
  const url=new URL(req.url), p=url.pathname, method=req.method;
  if(method==='GET'&&p==='/api/health') return json({ok:true});
  await ensureSeed(env);
  if(method==='GET'&&p==='/api/students') return json(await students(env));
  if(method==='GET'&&p==='/api/notes') return json(await notes(env,url));
  if(method==='POST'&&p==='/api/notes'){
    const b=await body(req); const content=String(b.content||'').trim();
    if(!b.student_id||!String(b.writer_name||'').trim()||!content)return json({error:'Zorunlu alanları doldurun.'},400);
    if(content.length<20||content.length>600)return json({error:'Andaç yazısı 20-600 karakter arasında olmalı.'},400);
    const s=await env.ANDAC_DB.prepare('SELECT id FROM students WHERE id=?').bind(Number(b.student_id)).first(); if(!s)return json({error:'Öğrenci bulunamadı.'},404);
    const r=await env.ANDAC_DB.prepare('INSERT INTO notes(student_id,writer_name,relationship,content,status,created_at) VALUES(?,?,?,?,?,?)').bind(Number(b.student_id),String(b.writer_name).trim(),b.relationship||'',content,'pending',new Date().toISOString()).run();
    return json({ok:true,id:r.meta.last_row_id,message:'Andaçınız başarıyla gönderildi.'});
  }
  if(method==='POST'&&p==='/api/admin/login'){const b=await body(req);return b.pin===env.ADMIN_PIN?json({ok:true}):json({error:'PIN hatalı'},401)}
  if(p.startsWith('/api/')&&!auth(req,env))return json({error:'Yetkisiz'},401);
  if(method==='PATCH'&&p.startsWith('/api/notes/')){const id=Number(p.split('/').pop()),b=await body(req);if(!['pending','approved','rejected'].includes(b.status))return json({error:'Geçersiz durum'},400);await env.ANDAC_DB.prepare('UPDATE notes SET status=? WHERE id=?').bind(b.status,id).run();return json({ok:true})}
  if(method==='DELETE'&&p.startsWith('/api/notes/')){await env.ANDAC_DB.prepare('DELETE FROM notes WHERE id=?').bind(Number(p.split('/').pop())).run();return json({ok:true})}
  if(method==='POST'&&p==='/api/students'){const b=await body(req);if(!b.name||!b.class_name)return json({error:'Ad ve sınıf zorunlu'},400);const r=await env.ANDAC_DB.prepare('INSERT INTO students(name,class_name,motto,photo,target) VALUES(?,?,?,?,?)').bind(b.name,b.class_name,b.motto||'',b.photo||'',Number(b.target)||5).run();return json({ok:true,id:r.meta.last_row_id})}
  if(method==='GET'&&p==='/api/export.csv'){return new Response(csv(await notes(env,url)),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="andaclar.csv"'}})}
  if(method==='GET'&&p==='/api/export.xls'){const rows=await notes(env,url);const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;');const h=['Tarih','Ogrenci','Sinif','Yazar','Iliski','Yazi','Durum'];let out='<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Andaclar"><Table><Row>'+h.map(x=>'<Cell><Data ss:Type="String">'+esc(x)+'</Data></Cell>').join('')+'</Row>';for(const n of rows){const v=[n.created_at,n.student_name,n.class_name,n.writer_name,n.relationship,n.content,n.status];out+='<Row>'+v.map(x=>'<Cell><Data ss:Type="String">'+esc(x)+'</Data></Cell>').join('')+'</Row>'}out+='</Table></Worksheet></Workbook>';return new Response(out,{headers:{'content-type':'application/vnd.ms-excel; charset=utf-8','content-disposition':'attachment; filename="andaclar.xls"'}})}
  return env.ASSETS.fetch(req);
}
export default { async fetch(req,env,ctx){ try{return await route(req,env)}catch(e){console.error(e);return json({error:'Sunucu hatası'},500)} } };
