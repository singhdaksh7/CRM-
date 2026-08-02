"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/utils";
import {
  MessageCircle,
  Send,
  RefreshCw,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import type { WhatsAppConversation, WhatsAppMessage, WhatsAppMessageStatus, WhatsAppProviderName } from "@prisma/client";

const SIMULATED_REPLIES = [
  "I like the second property.",
  "Can we visit tomorrow?",
  "Do you have anything closer to the metro?",
  "My budget is only ₹20,000.",
  "Please call me after 6 PM.",
  "I am not interested in these options.",
];

const PROVIDER_LABEL: Record<WhatsAppProviderName, string> = {
  MOCK: "Mock",
  CLICK_TO_CHAT: "Click-to-Chat",
  META_CLOUD: "Meta Cloud API",
};

export function ConversationPanel({ leadId, canManage }: { leadId: string; canManage: boolean }) {
  const [conversation, setConversation] = useState<WhatsAppConversation | null | undefined>(undefined);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [simulatedText, setSimulatedText] = useState(SIMULATED_REPLIES[0]);
  const [simulating, setSimulating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/leads/${leadId}/whatsapp`);
    if (res.ok) {
      const data = await res.json();
      setConversation(data.conversation);
      setMessages(data.messages ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function startConversation() {
    setStarting(true);
    const res = await fetch(`/api/leads/${leadId}/whatsapp/conversation`, { method: "POST" });
    setStarting(false);
    if (res.ok) {
      toast.success("WhatsApp conversation started");
      load();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to start conversation");
    }
  }

  async function sendMessage() {
    if (!text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/leads/${leadId}/whatsapp/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json();
      setText("");
      await load();
      if (data.clickToChatUrl) {
        toast.success("Message queued - click \"Open in WhatsApp\" below to send it.");
      } else if (data.message.status === "FAILED") {
        toast.error("Message failed to send");
      } else {
        toast.success("Message sent");
      }
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to send message");
    }
  }

  async function openInWhatsApp(message: WhatsAppMessage & { clickToChatUrl?: string }) {
    await fetch(`/api/leads/${leadId}/whatsapp/messages/${message.id}/mark-opened`, { method: "POST" });
    load();
  }

  async function simulateReply() {
    setSimulating(true);
    const res = await fetch(`/api/leads/${leadId}/whatsapp/simulate-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: simulatedText }),
    });
    setSimulating(false);
    if (res.ok) {
      toast.success("Simulated client reply received");
      load();
    } else {
      toast.error("Failed to simulate reply");
    }
  }

  async function simulateStatus(messageId: string, status: Extract<WhatsAppMessageStatus, "DELIVERED" | "READ" | "FAILED">) {
    const res = await fetch(`/api/leads/${leadId}/whatsapp/simulate-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, status }),
    });
    if (res.ok) load();
    else toast.error("Failed to simulate status");
  }

  async function retryMessage(messageId: string) {
    const res = await fetch(`/api/leads/${leadId}/whatsapp/messages/${messageId}/retry`, { method: "POST" });
    if (res.ok) {
      toast.success("Retry sent");
      load();
    } else {
      toast.error("Retry failed");
    }
  }

  if (loading) return <LoadingState label="Loading WhatsApp conversation..." />;

  if (!conversation) {
    return (
      <EmptyState
        title="No WhatsApp conversation yet"
        description="Start one to send messages, share catalogues, and track replies for this lead."
        action={
          <Button variant="whatsapp" onClick={startConversation} loading={starting}>
            <MessageCircle className="h-4 w-4" /> Start WhatsApp Conversation
          </Button>
        }
      />
    );
  }

  const isMock = conversation.provider === "MOCK";
  const isClickToChat = conversation.provider === "CLICK_TO_CHAT";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          <span className="font-semibold text-[#F8FAFC]">+{conversation.phoneNumber}</span>
          <Badge tone="whatsapp">{PROVIDER_LABEL[conversation.provider]}</Badge>
        </div>
        <button onClick={() => load()} className="flex items-center gap-1 text-xs font-semibold text-[#4F8CFF] hover:text-[#6BA0FF]">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="max-h-[420px] min-h-[220px] space-y-3 overflow-y-auto rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#11151F] p-4">
        {messages.length === 0 && <p className="text-center text-sm text-[#64748B]">No messages yet. Say hello!</p>}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} canManage={canManage} isMock={isMock} onOpenChat={() => openInWhatsApp(m)} onSimulateStatus={simulateStatus} onRetry={retryMessage} />
        ))}
      </div>

      {canManage && (
        <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-3 shadow-sm">
          <div className="flex gap-2">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." className="flex-1" />
            <Button variant="whatsapp" onClick={sendMessage} loading={sending} disabled={!text.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
          {isClickToChat && <p className="mt-1.5 text-xs text-[#94A3B8]">Click-to-Chat mode: sending queues the message, then opens WhatsApp for you to actually hit send.</p>}
        </div>
      )}

      {isMock && canManage && (
        <div className="rounded-xl border border-dashed border-[rgba(37,211,102,0.3)] bg-[rgba(37,211,102,0.06)] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#25D366]">
            <Sparkles className="h-3.5 w-3.5" /> Demo Controls (mock mode only)
          </p>
          <div className="flex flex-wrap gap-2">
            <Select value={simulatedText} onChange={(e) => setSimulatedText(e.target.value)} className="w-auto flex-1">
              {SIMULATED_REPLIES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" onClick={simulateReply} loading={simulating}>
              Simulate Client Reply
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[#94A3B8]">Per-message Delivered/Read/Failed controls appear under each outbound message above.</p>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  canManage,
  isMock,
  onOpenChat,
  onSimulateStatus,
  onRetry,
}: {
  message: WhatsAppMessage;
  canManage: boolean;
  isMock: boolean;
  onOpenChat: () => void;
  onSimulateStatus: (id: string, status: Extract<WhatsAppMessageStatus, "DELIVERED" | "READ" | "FAILED">) => void;
  onRetry: (id: string) => void;
}) {
  const isOutbound = message.direction === "OUTBOUND";
  const isClickToChatQueued = message.provider === "CLICK_TO_CHAT" && message.status === "QUEUED";

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
          isOutbound ? "rounded-br-sm bg-[#4F8CFF] text-white" : "rounded-bl-sm bg-[#1E2533] text-[#F8FAFC] border border-[rgba(255,255,255,0.08)]"
        }`}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <div className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${isOutbound ? "text-[#d9e2ff]" : "text-[#94A3B8]"}`}>
          <span>{formatDateTime(message.createdAt)}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>

        {message.status === "FAILED" && message.errorMessage && (
          <p className="mt-1 text-[11px] font-medium text-[#EF4444]">{message.errorMessage}</p>
        )}

        {canManage && isClickToChatQueued && (
          <button onClick={onOpenChat} className="mt-1.5 flex items-center gap-1 rounded-md bg-[#25D366] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#22bf5b]">
            <ExternalLink className="h-3 w-3" /> Open in WhatsApp
          </button>
        )}

        {canManage && message.status === "FAILED" && (
          <button onClick={() => onRetry(message.id)} className="mt-1.5 flex items-center gap-1 rounded-md bg-[rgba(239,68,68,0.2)] px-2 py-1 text-[11px] font-semibold text-[#EF4444] hover:bg-[rgba(239,68,68,0.3)]">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}

        {canManage && isMock && isOutbound && message.status !== "FAILED" && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-1.5">
            {message.status === "SENT" && (
              <button onClick={() => onSimulateStatus(message.id, "DELIVERED")} className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/30">
                Mark Delivered
              </button>
            )}
            {message.status === "DELIVERED" && (
              <button onClick={() => onSimulateStatus(message.id, "READ")} className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/30">
                Mark Read
              </button>
            )}
            {(message.status === "SENT" || message.status === "DELIVERED") && (
              <button onClick={() => onSimulateStatus(message.id, "FAILED")} className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-white/30">
                Mark Failed
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: WhatsAppMessageStatus }) {
  if (status === "QUEUED") return <Clock className="h-3 w-3" />;
  if (status === "SENT") return <Check className="h-3 w-3" />;
  if (status === "DELIVERED") return <CheckCheck className="h-3 w-3" />;
  if (status === "READ") return <CheckCheck className="h-3 w-3 text-[#25D366]" />;
  if (status === "FAILED") return <XCircle className="h-3 w-3 text-[#EF4444]" />;
  return null;
}
