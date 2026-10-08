#!/usr/bin/env bash
# Server-side R2 check (no secrets printed): PUT/HEAD/GET/DELETE of a tiny throwaway object,
# then an unauthenticated CORS preflight for the CRM origin (what a browser PUT needs).
set -uo pipefail
ENVF=/opt/kp-crm/env/.env.production
docker exec kp-crm node -e '
const {S3Client,HeadBucketCommand,PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand}=require("@aws-sdk/client-s3");
const e=process.env;const c=new S3Client({region:"auto",endpoint:"https://"+e.R2_ACCOUNT_ID+".r2.cloudflarestorage.com",credentials:{accessKeyId:e.R2_ACCESS_KEY_ID,secretAccessKey:e.R2_SECRET_ACCESS_KEY},requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
const Bucket=e.R2_BUCKET_NAME,Key="_deploy-check/"+Date.now()+".txt";
const step=async(n,f)=>{try{const r=await f();console.log(n,"OK");return r}catch(x){console.log(n,"FAIL",x.name,x.$metadata&&x.$metadata.httpStatusCode);throw x}};
(async()=>{await step("HEAD bucket (name+credentials)",()=>c.send(new HeadBucketCommand({Bucket})));
await step("PUT",()=>c.send(new PutObjectCommand({Bucket,Key,Body:"kp-deploy-check",ContentType:"text/plain"})));
await step("HEAD",()=>c.send(new HeadObjectCommand({Bucket,Key})));
const g=await step("GET",()=>c.send(new GetObjectCommand({Bucket,Key})));console.log("  body matches:",(await g.Body.transformToString())==="kp-deploy-check");
await step("DELETE",()=>c.send(new DeleteObjectCommand({Bucket,Key})));
try{await c.send(new HeadObjectCommand({Bucket,Key}));console.log("post-delete HEAD: still exists (BAD)")}catch(x){console.log("post-delete HEAD:",x.$metadata.httpStatusCode,"(gone)")}})().catch(()=>process.exit(1))'
rc=$?
B=$(grep ^R2_BUCKET_NAME= $ENVF | cut -d= -f2-); A=$(grep ^R2_ACCOUNT_ID= $ENVF | cut -d= -f2-); O=https://$(grep ^CRM_DOMAIN= $ENVF | cut -d= -f2-)
echo "CORS preflight for $O:"
curl -s -i -m15 -X OPTIONS "https://$B.$A.r2.cloudflarestorage.com/properties/_cors-probe.jpg" -H "Origin: $O" \
  -H "Access-Control-Request-Method: PUT" -H "Access-Control-Request-Headers: content-type" | tr -d '\r' | grep -iE '^(HTTP|access-control-allow-(origin|methods|headers))'
exit $rc
