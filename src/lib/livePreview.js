/**
 * Live Preview — peer-to-peer camera streaming between two devices on the
 * same account (the user's own /live phone ↔ desktop pairing).
 *
 * Architecture:
 *  - WebRTC carries the video stream directly between the two devices. No
 *    media ever touches our servers, so there's no bandwidth cost.
 *  - Supabase Realtime broadcast channel is the *signaling* layer: SDP
 *    offer/answer + ICE candidates are tiny JSON messages, pennies at most.
 *  - Channel name is `live:${pairingToken}`. The token is server-issued
 *    (get_live_pairing_token RPC), readable only by its owner.
 *  - Presence is used to discover the other side: each peer tracks itself
 *    with a `role` field, and the broadcaster automatically initiates the
 *    offer when it sees a viewer appear (and vice versa for cleanup).
 *
 * Limitations:
 *  - 1:1 only per channel.
 *  - STUN-only. ~80% of consumer NATs work; symmetric NATs (some corporate
 *    networks) need TURN. Add a TURN server later if reports come in.
 */
import { supabase } from './supabase.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const channelName = (key) => `live:${key}`;

/**
 * Resolve the caller's pairing token for /live (lazy-create on first call).
 * Returns a uuid the caller passes in as the channel-key for both
 * startBroadcaster and startViewer, so the realtime channel becomes
 * `live:{token}` instead of `live:{userId}`.
 *
 * Both devices belonging to the same user fetch the same token (the RPC
 * looks it up by auth.uid()), so they meet on the same channel without
 * any out-of-band coordination.
 */
export async function getLivePairingKey() {
  const { data, error } = await supabase.rpc('get_live_pairing_token');
  if (error) throw new Error(error.message || 'pairing token fetch failed');
  if (typeof data !== 'string' || data.length !== 36) {
    throw new Error('pairing token: unexpected response shape');
  }
  return data;
}

const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// ────────────────────────────────────────────────────────────────────────────
// Broadcaster: owns the camera stream, sends offers when a viewer appears.
// onQualityRequest: optional callback fired when the viewer requests a
// quality preset — the broadcaster's UI uses it to resize the canvas etc.
// ────────────────────────────────────────────────────────────────────────────
export function startBroadcaster({
  userId,
  stream,
  onStatus,
  onError,
  onQualityRequest,
}) {
  const myId = newId();
  let pc = null;
  let videoSender = null;
  let viewerId = null;
  let pendingIce = [];
  let stopped = false;

  const logTag = `[livePreview bcast ${channelName(userId)} ${myId.slice(0, 6)}]`;
  console.log(`${logTag} starting`);

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
    videoSender = null;

    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') videoSender = sender;
    });
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
    const keys = Object.keys(state);
    const roles = keys.map((k) => `${k.slice(0, 6)}=${state[k]?.[0]?.role ?? '?'}`);
    console.log(`${logTag} presence sync — ${roles.length} peer(s):`, roles.join(', ') || '(none)');
    let foundViewer = null;
    for (const key of keys) {
      const meta = state[key]?.[0];
      if (meta?.role === 'viewer') { foundViewer = key; break; }
    }
    if (foundViewer && foundViewer !== viewerId) {
      viewerId = foundViewer;
      console.log(`${logTag} viewer appeared, sending offer`);
      initiateOffer();
    } else if (!foundViewer && viewerId) {
      viewerId = null;
      console.log(`${logTag} viewer left, tearing down PC`);
      teardownPC();
      onStatus?.('waiting');
    }
  });

  channel.on('broadcast', { event: 'live' }, async ({ payload }) => {
    if (stopped || !payload || payload.fromId === myId) return;
    if (payload.role !== 'viewer') return;
    if (payload.to && payload.to !== myId) return;

    if (payload.type === 'quality' && payload.preset) {
      try { onQualityRequest?.(payload.preset); } catch { /* ignore */ }
      return;
    }

    if (!pc) return;

    try {
      if (payload.type === 'answer') {
        await pc.setRemoteDescription(payload.sdp);
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
    console.log(`${logTag} subscribe → ${status}`);
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({ role: 'broadcaster' });
        console.log(`${logTag} presence tracked as broadcaster`);
        onStatus?.('waiting');
      } catch (err) {
        console.warn(`${logTag} track() failed:`, err);
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
      console.log(`${logTag} stop()`);
      try { channel.untrack(); } catch { /* ignore */ }
      teardownPC();
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    },
    setEncoding: async ({ maxBitrate, maxFramerate } = {}) => {
      if (!videoSender) return;
      try {
        const params = videoSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        if (maxBitrate != null)   params.encodings[0].maxBitrate   = maxBitrate;
        if (maxFramerate != null) params.encodings[0].maxFramerate = maxFramerate;
        await videoSender.setParameters(params);
      } catch (err) {
        console.warn('[livePreview] setParameters failed:', err);
      }
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

  const logTag = `[livePreview view ${channelName(userId)} ${myId.slice(0, 6)}]`;
  console.log(`${logTag} starting`);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
    const keys = Object.keys(state);
    const roles = keys.map((k) => `${k.slice(0, 6)}=${state[k]?.[0]?.role ?? '?'}`);
    console.log(`${logTag} presence sync — ${roles.length} peer(s):`, roles.join(', ') || '(none)');
    let foundBroadcaster = null;
    for (const key of keys) {
      const meta = state[key]?.[0];
      if (meta?.role === 'broadcaster') { foundBroadcaster = key; break; }
    }
    if (foundBroadcaster && foundBroadcaster !== broadcasterId) {
      broadcasterId = foundBroadcaster;
      console.log(`${logTag} broadcaster appeared`);
      onStatus?.('connecting');
    } else if (!foundBroadcaster && broadcasterId) {
      broadcasterId = null;
      console.log(`${logTag} broadcaster left`);
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
    console.log(`${logTag} subscribe → ${status}`);
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({ role: 'viewer' });
        console.log(`${logTag} presence tracked as viewer`);
        onStatus?.('waiting');
      } catch (err) {
        console.warn(`${logTag} track() failed:`, err);
        onError?.('Could not announce this device.');
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onError?.('Signaling channel disconnected. Try again.');
    }
  });

  const send = (payload) => {
    if (stopped) return;
    channel.send({ type: 'broadcast', event: 'live', payload });
  };

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { channel.untrack(); } catch { /* ignore */ }
      try { pc.close(); } catch { /* ignore */ }
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    },
    requestQuality: (preset) => {
      send({
        type: 'quality',
        preset,
        fromId: myId,
        role: 'viewer',
        to: broadcasterId,
      });
    },
  };
}
