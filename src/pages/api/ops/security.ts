export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { trustedIp } from '../../../lib/ip';
import { opsAuditQuery } from '../../../lib/ops-auth';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

export const PATCH:APIRoute=async({request,locals})=>{
  const operator=locals.opsOperator;
  if(!operator)return json({error:'No autenticado'},401);
  if(operator.role!=='admin')return json({error:'Permiso insuficiente'},403);
  let body:any; try{body=await request.json()}catch{return json({error:'JSON inválido'},400)}
  if(body?.action!=='revoke_ops_session'||typeof body?.targetId!=='string'||!/^[a-f0-9]{64}$/i.test(body.targetId))return json({error:'Acción no permitida'},400);
  const target=await sql`select s.id,o.email from ops_sessions s join ops_operators o on o.user_id=s.operator_id where s.id=${body.targetId} limit 1`;
  if(!target.length)return json({error:'Sesión no encontrada'},404);
  const [revoked]=await sql.transaction([
    sql`delete from ops_sessions where id=${body.targetId} returning id`,
    opsAuditQuery({actorUserId:operator.userId,actorEmail:operator.email,action:'ops.privileged_session_revoked',targetType:'ops_session',targetId:body.targetId,result:'success',metadata:{target_email:target[0].email},ip:trustedIp(request),userAgent:request.headers.get('user-agent')}),
  ]);
  return json({success:true,affected:revoked.length});
};
