import { LRUCache } from "lru-cache";

import { SESSION_CONFIG } from "../config/constants.js";
import type { ToolContext } from "../types/index.js";

export interface SessionState {
  sessionId: string;
  lastActiveAt: number;
  context: ToolContext;
}

type SessionPoolOptions = {
  max: number;
  ttl: number;
};

export class SessionPool {
  private readonly sessions: LRUCache<string, SessionState>;

  public constructor(options: SessionPoolOptions) {
    this.sessions = new LRUCache<string, SessionState>({ max: options.max, ttl: options.ttl });
  }

  public setSession(sessionId: string, context: ToolContext): SessionState {
    const state: SessionState = {
      sessionId,
      lastActiveAt: Date.now(),
      context,
    };

    this.sessions.set(sessionId, state);

    return state;
  }

  public getSession(sessionId: string): SessionState | undefined {
    const state = this.sessions.get(sessionId);

    if (state === undefined) {
      return undefined;
    }

    state.lastActiveAt = Date.now();
    this.sessions.set(sessionId, state);

    return state;
  }

  public updateContext(sessionId: string, context: ToolContext): SessionState | undefined {
    const state = this.getSession(sessionId);

    if (state === undefined) {
      return undefined;
    }

    state.context = context;
    state.lastActiveAt = Date.now();
    this.sessions.set(sessionId, state);

    return state;
  }

  public deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const sessionPool = new SessionPool({
  max: SESSION_CONFIG.maxSessions,
  ttl: SESSION_CONFIG.ttlMs,
});
