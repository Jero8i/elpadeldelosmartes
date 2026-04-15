type Side = "drive" | "reves";

type Team = [string, string]; // [drive, reves]

type Match = [Team, Team];

type HistoryEntry = {
  key: string;
  sides?: Record<string, Side>;
  partnerships?: string[];
  partnershipDrive?: Record<string, string>;
};

type RemoteState = {
  group_id: string;
  players: string[];
  cycle_remaining_full: string[];
  history: HistoryEntry[];
};

// === Shared hosting (Supabase) ===
// 1) Create a Supabase project
// 2) Run supabase.sql in SQL Editor
// 3) Fill these 3 constants (Project Settings -> API)
const SUPABASE_URL = "https://lwjhdxtsaczcpnjtsjto.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3amhkeHRzYWN6Y3BuanRzanRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMjU3MjgsImV4cCI6MjA5MTgwMTcyOH0.qn6SUdZRlgYP2kZTChdD-T80ibxpGpQoyuzUpkYRNIQ";
const GROUP_ID = "padel-4";

function isRemoteConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && GROUP_ID);
}

const STORAGE_KEYS = {
  players: "padelPairs.players.v1",
};

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function mustQuery<T extends Element>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element ${selector}`);
  return el as T;
}

const inputIds = ["p1", "p2", "p3", "p4"];
const inputs = inputIds.map((id) => mustGetEl<HTMLInputElement>(id));

const messageEl = mustGetEl<HTMLDivElement>("message");
const outputEl = mustGetEl<HTMLDivElement>("output");
const lastEl = mustGetEl<HTMLDivElement>("last");

const downloadBtn = mustGetEl<HTMLButtonElement>("download");
const courtEl = mustQuery<HTMLDivElement>(".court");

const courtTL = mustGetEl<HTMLDivElement>("court-tl");
const courtTR = mustGetEl<HTMLDivElement>("court-tr");
const courtBL = mustGetEl<HTMLDivElement>("court-bl");
const courtBR = mustGetEl<HTMLDivElement>("court-br");

let currentMatch: Match | null = null;

function normalizeName(name: unknown): string {
  return String(name ?? "").trim();
}

function setMessage(text: string, kind: "info" | "error"): void {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", kind === "error");
}

function readPlayers(): string[] {
  return inputs.map((i) => normalizeName(i.value));
}

function validatePlayers(players: string[]): string | null {
  if (players.some((p) => p.length === 0)) {
    return "Completa los 4 nombres.";
  }
  const lower = players.map((p) => p.toLowerCase());
  const unique = new Set(lower);
  if (unique.size !== 4) {
    return "Los 4 jugadores deben ser distintos.";
  }
  return null;
}

function pairingOptions(players: string[]): Array<[string[], string[]]> {
  const [a, b, c, d] = players;
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];
}

function canonicalTeamKey(team: string[]): string {
  return [...team].map(normalizeName).sort((x, y) => x.localeCompare(y)).join("|");
}

function canonicalMatchKey(match: Match): string {
  const [t1, t2] = match;
  return [canonicalTeamKey(t1), canonicalTeamKey(t2)].sort((x, y) => x.localeCompare(y)).join(" vs ");
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const idx = Math.floor(Math.random() * items.length);
  return items[idx];
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMatch(match: Match | null): void {
  if (!match) {
    outputEl.innerHTML = '<div class="team">—</div><div class="team">—</div>';
    renderCourt(null);
    currentMatch = null;
    downloadBtn.disabled = true;
    return;
  }

  currentMatch = match;
  downloadBtn.disabled = false;
  const [t1, t2] = match;
  outputEl.innerHTML = `
    <div class="team">
      <span class="teamline">
        <span class="pill">${renderAvatarHtml(t1[0])}<strong>${escapeHtml(t1[0])}</strong> <span class="muted">(Drive)</span></span>
        <span>+</span>
        <span class="pill">${renderAvatarHtml(t1[1])}<strong>${escapeHtml(t1[1])}</strong> <span class="muted">(Revés)</span></span>
      </span>
    </div>
    <div class="team">
      <span class="teamline">
        <span class="pill">${renderAvatarHtml(t2[0])}<strong>${escapeHtml(t2[0])}</strong> <span class="muted">(Drive)</span></span>
        <span>+</span>
        <span class="pill">${renderAvatarHtml(t2[1])}<strong>${escapeHtml(t2[1])}</strong> <span class="muted">(Revés)</span></span>
      </span>
    </div>
  `;

  renderCourt(match);
}

function setCourtPlayer(el: HTMLElement, name: string): void {
  const nameEl = el.querySelector(".name") as HTMLSpanElement | null;
  const avatarEl = el.querySelector(".avatar-img") as HTMLImageElement | null;
  if (!nameEl || !avatarEl) return;

  const displayName = name && String(name).trim().length > 0 ? String(name) : "—";
  nameEl.textContent = displayName;
  if (displayName === "—") {
    avatarEl.removeAttribute("src");
    return;
  }
  avatarEl.src = avatarUrlForName(displayName);
}

function renderCourt(match: Match | null): void {
  if (!match) {
    setCourtPlayer(courtTL, "—");
    setCourtPlayer(courtTR, "—");
    setCourtPlayer(courtBL, "—");
    setCourtPlayer(courtBR, "—");
    return;
  }

  // match teams are [drive, reves]. Court is horizontal:
  // Team 1 = left side, Team 2 = right side.
  // Left side: revés top, drive bottom.
  // Right side: drive top, revés bottom.
  const [teamLeft, teamRight] = match;
  setCourtPlayer(courtTL, teamLeft[1]);
  setCourtPlayer(courtTR, teamLeft[0]);
  setCourtPlayer(courtBL, teamRight[0]);
  setCourtPlayer(courtBR, teamRight[1]);
}

function svgEscape(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toBase64Utf8(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1: string) => String.fromCharCode(parseInt(p1, 16)))
  );
}

async function fetchAvatarDataUrl(name: string): Promise<string | null> {
  const url = avatarUrlForName(name);
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("fetch failed");
    const svgText = await res.text();
    const base64 = toBase64Utf8(svgText);
    return `data:image/svg+xml;base64,${base64}`;
  } catch {
    return null;
  }
}

function initialsForName(name: string): string {
  const cleaned = String(name ?? "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function filenameNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `cancha-padel-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}.png`;
}

async function downloadCourtPng(): Promise<void> {
  if (!currentMatch) {
    setMessage("Primero generá un partido para descargar la cancha.", "error");
    return;
  }

  try {
    downloadBtn.disabled = true;
    setMessage("Generando imagen…", "info");

    const rect = courtEl.getBoundingClientRect();
    const scale = 2;
    const width = Math.max(800, Math.round(rect.width * scale));
    const height = Math.round(rect.height * scale);
    const sx = width / rect.width;
    const sy = height / rect.height;

    const courtStyle = getComputedStyle(courtEl);
    const blue = courtStyle.backgroundColor || "#1f5fbf";
    const borderColor = courtStyle.borderColor || "rgba(255,255,255,0.95)";
    const borderWidth = parseFloat(courtStyle.borderWidth || "2") * sx;
    const radius = parseFloat(courtStyle.borderRadius || "12") * sx;

    // Lines based on the same proportions used in CSS
    const netX = 0.5 * width;
    const serviceLeftX = 0.15 * width;
    const serviceRightX = 0.85 * width;
    const centerY = 0.5 * height;
    const inset = 8 * sx;

    const lineColor = "rgba(255,255,255,0.85)";
    const netColor = "rgba(255,255,255,0.95)";
    const lineWidth = Math.max(2, Math.round(2 * sx));

    type MarkerSnapshot = {
      pillX: number;
      pillY: number;
      pillW: number;
      pillH: number;
      radius: number;
      name: string;
      side: string;
      nameFontSize: number;
      sideFontSize: number;
      avatarX: number;
      avatarY: number;
      avatarSize: number;
      avatarHref: string | null;
    };

    async function snapshotMarker(el: HTMLElement): Promise<MarkerSnapshot> {
      const pillRect = el.getBoundingClientRect();
      const nameEl = el.querySelector(".name") as HTMLElement | null;
      const sideEl = el.querySelector(".side") as HTMLElement | null;
      const avatarEl = el.querySelector(".avatar-img") as HTMLImageElement | null;
      if (!nameEl || !sideEl || !avatarEl) throw new Error("Marker missing inner elements");

      const name = (nameEl.textContent ?? "").trim();
      const side = (sideEl.textContent ?? "").trim();

      const pillX = (pillRect.left - rect.left) * sx;
      const pillY = (pillRect.top - rect.top) * sy;
      const pillW = pillRect.width * sx;
      const pillH = pillRect.height * sy;

      const avatarRect = avatarEl.getBoundingClientRect();
      const avatarX = (avatarRect.left - rect.left) * sx;
      const avatarY = (avatarRect.top - rect.top) * sy;
      const avatarSize = Math.min(avatarRect.width * sx, avatarRect.height * sy);

      const nameStyle = getComputedStyle(nameEl);
      const sideStyle = getComputedStyle(sideEl);
      const nameFontSize = parseFloat(nameStyle.fontSize || "14") * sx;
      const sideFontSize = parseFloat(sideStyle.fontSize || "11") * sx;

      const href = name !== "—" ? await fetchAvatarDataUrl(name) : null;

      return {
        pillX,
        pillY,
        pillW,
        pillH,
        radius: pillH / 2,
        name,
        side,
        nameFontSize,
        sideFontSize,
        avatarX,
        avatarY,
        avatarSize,
        avatarHref: href,
      };
    }

    const markers = await Promise.all([
      snapshotMarker(courtTL),
      snapshotMarker(courtTR),
      snapshotMarker(courtBL),
      snapshotMarker(courtBR),
    ]);

    function markerSvg(m: MarkerSnapshot, idx: number): string {
      const clipId = `clip-${idx}-${Math.random().toString(16).slice(2)}`;
      const cx = m.avatarX + m.avatarSize / 2;
      const cy = m.avatarY + m.avatarSize / 2;
      const r = m.avatarSize / 2;

      const textX = m.avatarX + m.avatarSize + 10 * sx;
      const centerY = m.pillY + m.pillH / 2;

      const avatar = m.avatarHref
        ? `
          <defs>
            <clipPath id="${clipId}">
              <circle cx="${cx}" cy="${cy}" r="${r}" />
            </clipPath>
          </defs>
          <image href="${m.avatarHref}" x="${m.avatarX}" y="${m.avatarY}" width="${m.avatarSize}" height="${m.avatarSize}" clip-path="url(#${clipId})" />
        `
        : `
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.22)" />
          <text x="${cx}" y="${cy + m.nameFontSize * 0.4}" text-anchor="middle" font-size="${m.nameFontSize}" font-weight="700" fill="#ffffff">
            ${svgEscape(initialsForName(m.name))}
          </text>
        `;

      return `
        <g>
          <rect x="${m.pillX}" y="${m.pillY}" width="${m.pillW}" height="${m.pillH}" rx="${m.radius}" ry="${m.radius}" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.55)" stroke-width="${Math.max(1, Math.round(1 * sx))}" />
          ${avatar}
          <text x="${textX}" y="${centerY - m.nameFontSize * 0.15}" font-size="${m.nameFontSize}" font-weight="700" fill="#ffffff" dominant-baseline="middle">
            ${svgEscape(m.name)}
          </text>
          <text x="${textX}" y="${centerY + m.nameFontSize * 0.9}" font-size="${m.sideFontSize}" fill="rgba(255,255,255,0.85)" dominant-baseline="middle">
            ${svgEscape(m.side)}
          </text>
        </g>
      `;
    }

    const markersSvg = markers.map((m, idx) => markerSvg(m, idx)).join("\n");

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${blue}" />
        <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${Math.max(0, radius - inset)}" ry="${Math.max(
      0,
      radius - inset
    )}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" />

        <line x1="${serviceLeftX}" y1="${inset}" x2="${serviceLeftX}" y2="${height - inset}" stroke="${lineColor}" stroke-width="${lineWidth}" />
        <line x1="${serviceRightX}" y1="${inset}" x2="${serviceRightX}" y2="${height - inset}" stroke="${lineColor}" stroke-width="${lineWidth}" />

        <line x1="${netX}" y1="${inset}" x2="${netX}" y2="${height - inset}" stroke="${netColor}" stroke-width="${lineWidth}" />

        <line x1="${serviceLeftX}" y1="${centerY}" x2="${netX}" y2="${centerY}" stroke="${lineColor}" stroke-width="${lineWidth}" />
        <line x1="${netX}" y1="${centerY}" x2="${serviceRightX}" y2="${centerY}" stroke="${lineColor}" stroke-width="${lineWidth}" />

        ${markersSvg}
      </svg>
    `.trim();

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("No canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob(
          (pngBlob) => {
            if (!pngBlob) {
              reject(new Error("No se pudo generar el PNG."));
              return;
            }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(pngBlob);
            a.download = filenameNow();
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            resolve();
          },
          "image/png",
          1
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo renderizar la imagen."));
      };
      img.src = url;
    });

    setMessage("Imagen descargada.", "info");
  } catch (e) {
    setMessage(`Error generando imagen: ${(e as Error)?.message ?? String(e)}`, "error");
  } finally {
    downloadBtn.disabled = false;
  }
}

// Random avatar images per player (in-memory, per session). Not stored in DB.
const avatarSeedByPlayerKey = new Map<string, string>();

function randomSeed(): string {
  try {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return String(Math.random()).slice(2);
  }
}

function normalizeKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

function avatarUrlForName(name: string): string {
  const key = normalizeKey(name);
  if (!avatarSeedByPlayerKey.has(key)) {
    avatarSeedByPlayerKey.set(key, randomSeed());
  }
  const seed = avatarSeedByPlayerKey.get(key) ?? "";
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${encodeURIComponent(seed)}`;
}

function renderAvatarHtml(name: string): string {
  const url = avatarUrlForName(name);
  return `<img class="avatar-img" alt="" src="${escapeHtml(url)}" />`;
}

function teamPositionVariants(team: string[]): Team[] {
  return [
    [team[0], team[1]],
    [team[1], team[0]],
  ];
}

function fullMatchVariants(pairing: [string[], string[]]): Match[] {
  const [t1, t2] = pairing;
  const v1 = teamPositionVariants(t1);
  const v2 = teamPositionVariants(t2);
  return [
    [v1[0], v2[0]],
    [v1[0], v2[1]],
    [v1[1], v2[0]],
    [v1[1], v2[1]],
  ];
}

function getMatchSides(match: Match): Record<string, Side> {
  const sides: Record<string, Side> = {};
  sides[normalizeKey(match[0][0])] = "drive";
  sides[normalizeKey(match[0][1])] = "reves";
  sides[normalizeKey(match[1][0])] = "drive";
  sides[normalizeKey(match[1][1])] = "reves";
  return sides;
}

function pairKey(playerA: string, playerB: string): string {
  return [normalizeKey(playerA), normalizeKey(playerB)].sort((x, y) => x.localeCompare(y)).join("|");
}

function satisfiesNoRepeatSides(match: Match, lastSides: Record<string, Side> | null): boolean {
  if (!lastSides) return true;
  const current = getMatchSides(match);
  for (const [playerKey, side] of Object.entries(current)) {
    const prev = lastSides[playerKey];
    if (prev && prev === side) return false;
  }
  return true;
}

function canonicalFullMatchKey(match: Match): string {
  const t1 = `${normalizeKey(match[0][0])}>${normalizeKey(match[0][1])}`;
  const t2 = `${normalizeKey(match[1][0])}>${normalizeKey(match[1][1])}`;
  return [t1, t2].sort((x, y) => x.localeCompare(y)).join(" vs ");
}

async function supabaseFetch(
  pathname: string,
  opts: {
    method?: string;
    query?: string;
    body?: unknown;
    prefer?: string | null;
  } = {}
): Promise<unknown> {
  const { method = "GET", query = "", body = null, prefer = null } = opts;
  const url = `${SUPABASE_URL.replace(/\/$/, "")}${pathname}${query}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (body) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase error ${res.status}: ${text || res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  return res.json();
}

function canonicalPlayersKey(players: string[]): string {
  return players
    .map((p) => normalizeKey(p))
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

function buildHistoryEntry(match: Match): HistoryEntry {
  const sides = getMatchSides(match);
  const p1 = pairKey(match[0][0], match[0][1]);
  const p2 = pairKey(match[1][0], match[1][1]);
  const partnershipDrive: Record<string, string> = {};
  partnershipDrive[p1] = normalizeKey(match[0][0]);
  partnershipDrive[p2] = normalizeKey(match[1][0]);
  return {
    key: canonicalFullMatchKey(match),
    sides,
    partnerships: [p1, p2],
    partnershipDrive,
  };
}

function allFullMatchOptions(players: string[]): Array<{ key: string; match: Match }> {
  const pairings = pairingOptions(players);
  const matches = pairings.flatMap((p) => fullMatchVariants(p));
  const seen = new Set<string>();
  const unique: Array<{ key: string; match: Match }> = [];
  for (const m of matches) {
    const key = canonicalFullMatchKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ key, match: m });
  }
  return unique;
}

function scoreCandidateWithHistory(match: Match, lastSides: Record<string, Side> | null, history: HistoryEntry[]): number {
  const candidateSides = getMatchSides(match);
  const candidateKey = canonicalFullMatchKey(match);
  const candidatePartnerships = [pairKey(match[0][0], match[0][1]), pairKey(match[1][0], match[1][1])];
  const candidateDriveByPartnership: Record<string, string> = {};
  candidateDriveByPartnership[candidatePartnerships[0]] = normalizeKey(match[0][0]);
  candidateDriveByPartnership[candidatePartnerships[1]] = normalizeKey(match[1][0]);

  let penalty = 0;

  if (lastSides) {
    for (const [playerKey, side] of Object.entries(candidateSides)) {
      if (lastSides[playerKey] && lastSides[playerKey] === side) penalty += 10000;
    }
  }

  for (let i = 0; i < history.length; i += 1) {
    const age = i + 1;
    const h = history[i];
    if (!h || !h.key) continue;

    if (h.key === candidateKey) penalty += 2000 / age;

    if (h.sides) {
      for (const [playerKey, side] of Object.entries(candidateSides)) {
        if (h.sides[playerKey] && h.sides[playerKey] === side) penalty += 80 / age;
      }
    }

    if (h.partnerships) {
      for (const pk of candidatePartnerships) {
        if (h.partnerships.includes(pk)) penalty += 40 / age;
      }
    }

    if (h.partnershipDrive) {
      for (const pk of candidatePartnerships) {
        if (h.partnershipDrive[pk] && h.partnershipDrive[pk] === candidateDriveByPartnership[pk]) {
          penalty += 30 / age;
        }
      }
    }
  }

  return penalty;
}

function initialRemoteState(players: string[]): RemoteState {
  const all = allFullMatchOptions(players);
  return {
    group_id: GROUP_ID,
    players,
    cycle_remaining_full: all.map((x) => x.key),
    history: [],
  };
}

async function loadRemoteState(players: string[]): Promise<RemoteState> {
  const query = `?group_id=eq.${encodeURIComponent(GROUP_ID)}&select=*`;
  const rows = (await supabaseFetch("/rest/v1/padel_state", { query })) as unknown;
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

  if (!row) {
    const init = initialRemoteState(players);
    await supabaseFetch("/rest/v1/padel_state", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: init,
    });
    return init;
  }

  if (!Array.isArray(row.players) || row.players.length !== 4 || canonicalPlayersKey(row.players) !== canonicalPlayersKey(players)) {
    const init = initialRemoteState(players);
    await supabaseFetch("/rest/v1/padel_state", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: init,
    });
    return init;
  }

  const all = allFullMatchOptions(players);
  const allKeys = all.map((x) => x.key);
  const validRemaining = Array.isArray(row.cycle_remaining_full)
    ? row.cycle_remaining_full.filter((k: unknown) => typeof k === "string" && allKeys.includes(k))
    : [];

  const history = Array.isArray(row.history) ? (row.history as HistoryEntry[]).slice(0, 8) : [];

  return {
    group_id: GROUP_ID,
    players,
    cycle_remaining_full: validRemaining.length > 0 ? validRemaining : allKeys,
    history,
  };
}

async function saveRemoteState(state: RemoteState): Promise<void> {
  await supabaseFetch("/rest/v1/padel_state", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      group_id: GROUP_ID,
      players: state.players,
      cycle_remaining_full: state.cycle_remaining_full,
      history: state.history,
      updated_at: new Date().toISOString(),
    },
  });
}

function pickNextMatchFromState(players: string[], state: RemoteState): {
  chosen: Match;
  nextState: RemoteState;
  strictOk: boolean;
} {
  const history = Array.isArray(state.history) ? state.history.slice(0, 8) : [];
  const lastSides = (history[0]?.sides as Record<string, Side> | undefined) ?? null;
  const lastFullKey = history[0]?.key ?? null;

  const all = allFullMatchOptions(players);
  const allKeys = all.map((x) => x.key);
  const byKey = new Map(all.map((x) => [x.key, x.match] as const));

  let remaining = Array.isArray(state.cycle_remaining_full)
    ? state.cycle_remaining_full.filter((k) => typeof k === "string" && byKey.has(k))
    : [];
  if (remaining.length === 0) remaining = [...allKeys];

  let candidates = remaining.map((k) => byKey.get(k)).filter((m): m is Match => Boolean(m));
  if (candidates.length === 0) {
    remaining = [...allKeys];
    candidates = remaining.map((k) => byKey.get(k)).filter((m): m is Match => Boolean(m));
  }

  if (candidates.length > 1 && lastFullKey) {
    const filtered = candidates.filter((m) => canonicalFullMatchKey(m) !== lastFullKey);
    if (filtered.length > 0) candidates = filtered;
  }

  if (lastSides) {
    const strict = candidates.filter((m) => satisfiesNoRepeatSides(m, lastSides));
    if (strict.length > 0) candidates = strict;
  }

  let bestPenalty = Infinity;
  let best: Match[] = [];
  for (const c of candidates) {
    const p = scoreCandidateWithHistory(c, lastSides, history);
    if (p < bestPenalty) {
      bestPenalty = p;
      best = [c];
    } else if (p === bestPenalty) {
      best.push(c);
    }
  }

  const chosen = pickRandom(best.length > 0 ? best : candidates);
  if (!chosen) throw new Error("No se pudo generar un partido");

  const chosenKey = canonicalFullMatchKey(chosen);
  const nextRemaining = remaining.filter((k) => k !== chosenKey);
  const entry = buildHistoryEntry(chosen);
  const nextHistory = [entry, ...history.filter((h) => h.key !== entry.key)].slice(0, 8);

  const strictOk = !lastSides || satisfiesNoRepeatSides(chosen, lastSides);

  return {
    chosen,
    nextState: {
      ...state,
      players,
      cycle_remaining_full: nextRemaining,
      history: nextHistory,
    },
    strictOk,
  };
}

function loadState(): void {
  try {
    const rawPlayers = localStorage.getItem(STORAGE_KEYS.players);
    if (rawPlayers) {
      const saved = JSON.parse(rawPlayers) as unknown;
      if (Array.isArray(saved) && saved.length === 4) {
        saved.forEach((v, idx) => {
          inputs[idx].value = normalizeName(v);
        });
      }
    }
  } catch {
    // ignore
  }
}

function savePlayers(players: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.players, JSON.stringify(players));
  } catch {
    // ignore
  }
}

function setLastDisplayFromHistory(history: HistoryEntry[]): void {
  const lastKey = history?.[0]?.key;
  if (lastKey) lastEl.textContent = `Último partido guardado: ${lastKey}`;
  else lastEl.textContent = "";
}

async function generate(): Promise<void> {
  const players = readPlayers();
  const error = validatePlayers(players);
  if (error) {
    setMessage(error, "error");
    return;
  }

  if (!isRemoteConfigured()) {
    setMessage("Falta configurar Supabase (SUPABASE_URL y SUPABASE_ANON_KEY) en main.ts.", "error");
    return;
  }

  savePlayers(players);

  try {
    setMessage("Generando…", "info");
    const state = await loadRemoteState(players);
    const { chosen, nextState, strictOk } = pickNextMatchFromState(players, state);

    renderMatch(chosen);
    setLastDisplayFromHistory(nextState.history);
    await saveRemoteState(nextState);

    if (!strictOk) {
      setMessage(
        "En esta combinación no se puede evitar que todos cambien de lado; se generó la mejor opción disponible.",
        "info"
      );
    } else {
      setMessage("", "info");
    }
  } catch (e) {
    setMessage(`Error guardando en Supabase: ${(e as Error)?.message ?? String(e)}`, "error");
  }
}

function setup(): void {
  mustGetEl("generate").addEventListener("click", () => void generate());
  downloadBtn.addEventListener("click", () => void downloadCourtPng());

  mustGetEl("swap").addEventListener("click", () => {
    const tmp = inputs[1].value;
    inputs[1].value = inputs[2].value;
    inputs[2].value = tmp;
    setMessage("Intercambiados Jugador 2 y Jugador 3.", "info");
    savePlayers(readPlayers());
  });

  mustGetEl("reset").addEventListener("click", () => {
    void (async () => {
      const players = readPlayers();
      const error = validatePlayers(players);
      if (error) {
        setMessage(error, "error");
        return;
      }

      if (!isRemoteConfigured()) {
        setMessage("Falta configurar Supabase (SUPABASE_URL y SUPABASE_ANON_KEY) en main.ts.", "error");
        return;
      }

      try {
        const init = initialRemoteState(players);
        await saveRemoteState(init);
        setLastDisplayFromHistory([]);
        renderMatch(null);
        setMessage("Listo: se reseteó el historial compartido.", "info");
      } catch (e) {
        setMessage(`Error reseteando Supabase: ${(e as Error)?.message ?? String(e)}`, "error");
      }
    })();
  });

  inputs.forEach((i) =>
    i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void generate();
    })
  );

  loadState();

  void (async () => {
    if (!isRemoteConfigured()) return;
    try {
      const players = readPlayers();
      const error = validatePlayers(players);
      if (error) return;
      const state = await loadRemoteState(players);
      setLastDisplayFromHistory(state.history);
    } catch {
      // ignore
    }
  })();
}

setup();
