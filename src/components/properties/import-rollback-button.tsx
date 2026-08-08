"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function ImportRollbackButton({ jobId }: { jobId: string }) { const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const router=useRouter(); return <div><Button variant="danger" loading={busy} onClick={async()=>{if(!window.confirm("Rollback only properties created by this import? This is blocked when dependent business data exists."))return;setBusy(true);const r=await fetch(`/api/imports/${jobId}/rollback`,{method:"POST"});const b=await r.json();setBusy(false);if(!r.ok)setError(b.error??"Rollback failed");else router.refresh();}}>Rollback Created Records</Button>{error&&<p className="mt-2 text-sm text-red-700">{error}</p>}</div> }
