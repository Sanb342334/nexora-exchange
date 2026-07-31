'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { tokenStore } from './api';

function resolveWsUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:4000';
}

const WS_URL = resolveWsUrl();

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = tokenStore.access;
  if (!socket) {
    socket = io(`${WS_URL}/ws`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      autoConnect: true,
    });
  } else if (token) {
    // Refresh token on existing socket (Telegram silent auth)
    (socket as Socket).auth = { token };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

export function reconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  return getSocket();
}

/** Subscribe to a socket event for the lifetime of a component. */
export function useSocketEvent(event: string, handler: (payload: any) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = getSocket();
    const cb = (payload: any) => handlerRef.current(payload);
    s.on(event, cb);
    return () => {
      s.off(event, cb);
    };
  }, [event]);
}
