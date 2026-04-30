/**
 * Live Preview — peer-to-peer camera streaming between two devices on the
 * same account.
 *
 * Architecture:
 *  - WebRTC carries the video stream directly between the two devices. No
 *    media ever touches our servers, so there's no bandwidth cost.
 *  - Supabase Realtime broadcast channel is the *signaling* layer: SDP
 *    offer/answer + ICE candidates are tiny JSON messages, pennies at most.
 *  - Channel name is `live:${userId}`. The user UUID is unguessable, so
 *    only devices that already authenticated as that user can find it.
 *  - Presence is used to discover the other side: each peer tracks itself
 *    with a `role` field, and the broadcaster automatically initiates the
 *    offer when it sees a viewer appear (and vice versa for cleanup).
 *
 * Limitations:
 *  - 1:1 only. If a second viewer joins, only the first is paired.
 *  - STUN-only. ~80% of consumer NATs work; symmetric NATs (some corporate
 *    networks) need TURN. Add a TURN server later if reports come in.
 */
import { supabase } from './supabase.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const channelName = (userId) => `live:${userId}`;
const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// ────────────────────────────────────────────────────────────────────────────
// Broadcaster: owns the camera stream, sends offers when a viewer appears.
// ────────────────────────────────────────────────────────────────────────────
export function startBroadcaster({ userId, stream, onStatus, onError }) {
  const myId = newId();
  let pc = null;
  let viewerId = null;
  let pendingIce = [];
  let stopped = false;

  const channel = supabase.channel(channelName(userId), {
    config: {
      broadcast: { self: false },
      presence: { key: myId },
    },
  });

  const send = (type, extra = {}) => {
    if (stopped) return;
    channel.send({
      type: 'broadcast',
      event: 'live',
      payload: { type, fromId: myId, role: 'broadcaster', ...extra },
    });
  };

  const teardownPC = () => {
    if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
    pendingIce = [];
  };

  const initiateOffer = async () => {
    teardownPC();
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onicecandidate = (e) => {
      if (e.candidate && viewerId) send('ice', { candidate: e.candidate, to: viewerId });
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      const s = pc.connectionState;
      if (s === 'connected') onStatus?.('connected');
      else if (s === 'failed') {
        onStatus?.('disconnected');
        teardownPC();
        viewerId = null;
      } else if (s === 'disconnected') {
        onStatus?.('reconnecting');
      }
    };

    onStatus?.('connecting');
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send('offer', { sdp: offer, to: viewerId });
    } catch (err) {
      onError?.(err?.message ?? 'Failed to start the connection.');
    }
  };

  channel.on('presence', { event: 'sync' }, () => {
    if (stopped) return;
    const state = channel.presenceState();
    let foundViewer = null;
    for (const key of Object.keys(state)) {
      const meta = state[key]?.[0];
      if (meta?.role === 'viewer') { foundViewer = key; break; }
    }
    if (foundViewer && foundViewer !== viewerId) {
      viewerId = foundViewer;
      initiateOffer();
    } else if (!foundViewer && viewerId) {
      viewerId = null;
      teardownPC();
      onStatus?.('waiting');
    }
  });

  channel.on('broadcast', { event: 'live' }, async ({ payload }) => {
    if (stopped || !payload || payload.fromId === myId) return;
    if (payload.role !== 'viewer') return;
    if (payload.to && payload.to !== myId) return;
    if (!pc) return;

    try {
      if (payload.type === 'answer') {
        await pc.setRemoteDescription(payload.sdp);
        // ICE that arrived before remoteDescription was set must be replayed now.
        while (pendingIce.length) {
          try { await pc.addIceCandidate(pendingIce.shift()); } catch { /* ignore */ }
        }
      } else if (payload.type === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          pendingIce.push(payload.candidate);
        }
      }
    } catch (err) {
      console.warn('[livePreview] broadcaster handler error:', err);
    }
  });

  channel.subscribe(async (status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({ role: 'broadcaster' });
        onStatus?.('waiting');
      } catch {
        onError?.('Could not announce this device.');
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onError?.('Signaling channel disconnected. Try again.');
    }
  });

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { channel.untrack(); } catch { /* ignore */ }
      teardownPC();
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Viewer: receive-only side. Waits for an offer, answers it.
// ────────────────────────────────────────────────────────────────────────────
export function startViewer({ userId, onStream, onStatus, onError }) {
  const myId = newId();
  let broadcasterId = null;
  let pendingIce = [];
  let stopped = false;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  // Tell the PC we expect to receive media. Without these transceivers some
  // browsers won't emit ontrack on remote-only sessions.
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    if (e.streams?.[0]) onStream?.(e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') onStatus?.('connected');
    else if (s === 'disconnected') onStatus?.('reconnecting');
    else if (s === 'failed') onStatus?.('disconnected');
  };

  const channel = supabase.channel(channelName(userId), {
    config: {
      broadcast: { self: false },
      presence: { key: myId },
    },
  });

  pc.onicecandidate = (e) => {
    if (e.candidate && broadcasterId) {
      channel.send({
        type: 'broadcast',
        event: 'live',
        payload: { type: 'ice', fromId: myId, role: 'viewer', candidate: e.candidate, to: broadcasterId },
      });
    }
  };

  channel.on('presence', { event: 'sync' }, () => {
    if (stopped) return;
    const state = channel.presenceState();
    let foundBroadcaster = null;
    for (const key of Object.keys(state)) {
      const meta = state[key]?.[0];
      if (meta?.role === 'broadcaster') { foundBroadcaster = key; break; }
    }
    if (foundBroadcaster && foundBroadcaster !== broadcasterId) {
      broadcasterId = foundBroadcaster;
      onStatus?.('connecting');
    } else if (!foundBroadcaster && broadcasterId) {
      broadcasterId = null;
      onStatus?.('waiting');
    }
  });

  channel.on('broadcast', { event: 'live' }, async ({ payload }) => {
    if (stopped || !payload || payload.fromId === myId) return;
    if (payload.role !== 'broadcaster') return;
    if (payload.to && payload.to !== myId) return;

    try {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription(payload.sdp);
        while (pendingIce.length) {
          try { await pc.addIceCandidate(pendingIce.shift()); } catch { /* ignore */ }
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast',
          event: 'live',
          payload: { type: 'answer', fromId: myId, role: 'viewer', sdp: answer, to: payload.fromId },
        });
      } else if (payload.type === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          pendingIce.push(payload.candidate);
        }
      }
    } catch (err) {
      console.warn('[livePreview] viewer handler error:', err);
    }
  });

  channel.subscribe(async (status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({ role: 'viewer' });
        onStatus?.('waiting');
      } catch {
        onError?.('Could not announce this device.');
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onError?.('Signaling channel disconnected. Try again.');
    }
  });

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { channel.untrack(); } catch { /* ignore */ }
      try { pc.close(); } catch { /* ignore */ }
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    },
  };
}
