import { SKINS, type SkinId } from '../game/game.ts';

export type PartyProfile = Readonly<{ id: string; name: string; skin: SkinId }>;
export type Party = Readonly<{
  id: string;
  invite: string;
  createdAt: string;
  syncedAt: string | null;
  members: number;
}>;
export type PartyHome = Readonly<{ profile: PartyProfile | null; party: Party | null }>;
export type PartyMember = Readonly<{
  id: string;
  name: string;
  skin: SkinId;
  steps: number | null;
  place: number | null;
  tied: number | null;
  syncedAt: string | null;
}>;
export type RaceWeek = Readonly<{ start: string; end: string; next: number }>;
export type PartyError = 'network' | 'invite' | 'membership' | 'session' | 'data';
export type PartyResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: PartyError }>;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function id(value: unknown): value is string {
  // Convex document IDs are opaque strings; their table is validated by the API.
  return typeof value === 'string' && value.length > 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function skin(value: unknown): value is SkinId {
  return SKINS.some((item) => item.id === value);
}

export function validPartyName(value: string): boolean {
  const name = value.trim();
  const characters = Array.from(name);
  return (
    characters.length >= 1 &&
    characters.length <= 24 &&
    characters.every((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 31 && (code < 127 || code > 159) && code !== 8232 && code !== 8233;
    })
  );
}

export function inviteCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(code) ? code : null;
}

export function decodeHome(value: unknown): PartyHome | null {
  if (!object(value)) return null;
  let profile: PartyProfile | null = null;
  let party: Party | null = null;
  if (value.profile !== null) {
    const p = value.profile;
    if (!object(p) || !id(p.id) || typeof p.name !== 'string' || !validPartyName(p.name) || !skin(p.skin))
      return null;
    profile = { id: p.id, name: p.name, skin: p.skin };
  }
  if (value.party !== null) {
    const r = value.party;
    if (
      !profile ||
      !object(r) ||
      !id(r.id) ||
      typeof r.invite_code !== 'string' ||
      !inviteCode(r.invite_code) ||
      !timestamp(r.created_at) ||
      (r.synced_at !== null && !timestamp(r.synced_at)) ||
      !natural(r.member_count) ||
      r.member_count < 1
    )
      return null;
    party = {
      id: r.id,
      invite: r.invite_code,
      createdAt: r.created_at,
      syncedAt: r.synced_at,
      members: r.member_count,
    };
  }
  return { profile, party };
}

export function decodeBoard(value: unknown): readonly PartyMember[] | null {
  if (!Array.isArray(value)) return null;
  const rows: PartyMember[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (
      !object(row) ||
      !id(row.user_id) ||
      seen.has(row.user_id) ||
      typeof row.name !== 'string' ||
      !validPartyName(row.name) ||
      !skin(row.skin) ||
      (row.synced_at !== null && !timestamp(row.synced_at))
    )
      return null;
    const steps = row.steps === null ? null : natural(row.steps) ? row.steps : undefined;
    const place = row.place === null ? null : natural(row.place) && row.place >= 1 ? row.place : undefined;
    const tied = row.tied === null ? null : natural(row.tied) && row.tied >= 1 ? row.tied : undefined;
    if (steps === undefined || place === undefined || tied === undefined) return null;
    const unread = steps === null && place === null && tied === null;
    const scored = steps !== null && place !== null && tied !== null;
    if (!unread && !scored) return null;
    seen.add(row.user_id);
    rows.push({
      id: row.user_id,
      name: row.name,
      skin: row.skin,
      steps,
      place,
      tied,
      syncedAt: row.synced_at,
    });
  }
  return rows;
}

// One UTC reset boundary gives every party member the same race, including travelers.
export function raceWeek(now = new Date()): RaceWeek {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    next: next.getTime(),
  };
}

export function partyErrorCopy(error: PartyError): string {
  switch (error) {
    case 'invite':
      return 'invite not found. check the code.';
    case 'membership':
      return 'leave your current party first.';
    case 'session':
      return 'party login could not open. tap try again.';
    case 'data':
      return 'party data could not be read. try again.';
    case 'network':
      return 'could not connect.';
  }
}
